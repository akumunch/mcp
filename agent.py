from __future__ import annotations

import asyncio
import json
import sys
import time
import jsonschema

import httpx

from config import Config
from registry import MCPRegistry



# ── Gemini planner ────────────────────────────────────────────────────────────

def _serialize_tools(tools: list[dict]) -> str:
    lines = []
    for t in tools:
        schema = t.get("input_schema") or {}
        props = schema.get("properties", {})
        required = set(schema.get("required", []))
        args = "\n".join(
            f"    - {k}: {v.get('type', 'unknown')}"
            + (f" (required)" if k in required else "")
            + (f" — {v['description']}" if v.get("description") else "")
            + (f" — must be one of: {v['enum']}" if v.get("enum") else "")
            for k, v in props.items()
            if k != "cloudId"
        )
        lines.append(
            f"Tool name: {t['name']}\n"
            f"Description: {t['description']}\n"
            f"Arguments:\n{args or '    - none'}"
        )
    return "\n\n".join(lines)


async def _call_gemini(prompt: str, temperature: float = 0.0) -> dict:
    url = (
        f"https://generativelanguage.googleapis.com/v1beta/models/"
        f"{Config.GEMINI_MODEL}:generateContent?key={Config.GEMINI_API_KEY}"
    )
    payload = {
        "contents": [{"parts": [{"text": prompt}]}],
        "generationConfig": {
            "temperature": temperature,
            "maxOutputTokens": 2048,
            "responseMimeType": "application/json",
        },
    }

    text = ""
    last_err = None
    async with httpx.AsyncClient(timeout=30) as client:
        for attempt in range(3):
            try:
                resp = await client.post(url, json=payload)
                resp.raise_for_status()
                text = resp.json()["candidates"][0]["content"]["parts"][0]["text"]
                break
            except Exception as exc:
                last_err = exc
                time.sleep(0.2 * (2 ** attempt))

    if not text:
        raise RuntimeError(f"Gemini failed: {last_err}")

    try:
        return json.loads(text)
    except json.JSONDecodeError as exc:
        raise RuntimeError(f"Gemini returned invalid JSON: {exc}\nRaw text: {text}")

def _validate_actions(actions: list[dict], tool_schemas: dict[str, dict]) -> list[str]:
    errors = []
    for action in actions:
        name = action.get("tool")
        schema = tool_schemas.get(name)
        if not schema:
            continue
        try:
            jsonschema.validate(instance=action.get("args", {}), schema=schema)
        except jsonschema.ValidationError as e:
            errors.append(f"Tool '{name}': {e.message} (at path: {list(e.path)})")
    return errors


async def plan_actions(tools: list[dict], user_request: str, context: str = "") -> list[dict]:
    tool_list = _serialize_tools(tools)
    tool_schemas = {t["name"]: (t.get("input_schema") or {}) for t in tools}

    context_block = (
        f"\n\nA prior tool call already ran to gather context. Use its result below to "
        f"finish planning the user's actual request — do NOT call that same tool again:\n{context}\n"
        if context else ""
    )

    system = (
        "You are an MCP planning agent with access to Jira, Google Calendar, and Slack tools.\n"
        "Available server names are exactly: jira, google_calendar, slack. Use these exact names.\n"
        "Given a user's natural-language request, select the correct tool and return ONLY valid JSON.\n"
        "No extra text, no markdown, no explanation.\n"
        "IMPORTANT: Every argument marked (required) in a tool's Arguments list MUST be included "
        "in args, with a non-empty value. If an argument lists allowed values ('must be one of'), "
        "you MUST pick one of those exact values based on the user's request — never leave args empty "
        "for a tool that has required arguments.\n"
        "Example — if a tool has Arguments:\n"
        "    - action: string (required) — must be one of: ['list', 'add', 'remove']\n"
        "    - account_id: string\n"
        "and the user asks to add an account, the correct args is:\n"
        '    {"action": "add", "account_id": "work"}\n'
        "NOT an empty object — an empty args object is only valid for tools with zero required arguments.\n"
        "The default Jira project key is SCRUM — only use this for Jira requests.\n"
        "For Slack, use slack_post_message to send messages, not slack_list_channels.\n"
        'Return JSON in the form: {"actions":[{"server":"server_name","tool":"tool_name","args":{...}}]}'
    )
    base_prompt = f"{system}\n\nAvailable tools:\n{tool_list}{context_block}\n\nUser request: {user_request}"

    prompt = base_prompt
    parsed = None
    errors = []
    max_attempts = 3

    for attempt in range(max_attempts):
        temp = 0.0 if attempt == 0 else 0.4
        parsed = await _call_gemini(prompt, temperature=temp)
        actions = parsed.get("actions", [])
        errors = _validate_actions(actions, tool_schemas)

        if not errors:
            print(f"🤖 Gemini planned: {json.dumps(parsed, indent=2)}")
            return actions

        print(f"⚠️ Planner validation failed (attempt {attempt + 1}/{max_attempts}): {errors}")
        prompt = (
            f"{base_prompt}\n\n"
            f"Your previous response was:\n{json.dumps(parsed)}\n\n"
            f"That response is INVALID for these reasons:\n" + "\n".join(errors) + "\n\n"
            "Return corrected JSON in the exact same format. Every required field listed in the "
            "errors above must be present in args with a valid, non-empty value."
        )

    raise RuntimeError(f"Planner failed schema validation after {max_attempts} attempts: {errors}")


# ── Output formatter ──────────────────────────────────────────────────────────

def _format_result(tool_name: str, raw: str) -> str:
    if tool_name == "slack_list_channels":
        try:
            data = json.loads(raw)
            channels = data.get("channels", [])
            lines = [
                f"#{c['name']} ({c.get('num_members', 0)} members)"
                + (" [archived]" if c.get("is_archived") else "")
                for c in channels
            ]
            return "\n".join(lines) or "No channels found."
        except Exception:
            return raw

    if tool_name == "searchJiraIssuesUsingJql":
        try:
            data   = json.loads(raw)
            issues = data.get("issues", [])
            lines  = [
                f"{i['key']} — {i['fields']['summary']} ({i['fields']['status']['name']})"
                for i in issues
            ]
            return "\n".join(lines) or "No issues found."
        except Exception:
            return raw

    return raw


# ── Main ──────────────────────────────────────────────────────────────────────

async def main() -> None:
    request = " ".join(sys.argv[1:]).strip()
    if not request:
        print('Usage: python agent.py "<natural language request>"', file=sys.stderr)
        sys.exit(1)

    registry = MCPRegistry()

    print("🔍 Discovering tools from all MCP servers...")
    tools = await registry.discover_all_tools()
    print(f"✅ Found {len(tools)} tools total")

    actions = await plan_actions(tools, request)

    # If Gemini planned a single "context-gathering" call (e.g. get-current-time)
    # instead of the real action, run it, then re-plan with that result as context.
    CONTEXT_ONLY_TOOLS = {"get-current-time"}
    if len(actions) == 1 and actions[0]["tool"] in CONTEXT_ONLY_TOOLS:
        ctx_action = actions[0]
        print(f"▶ Calling {ctx_action['tool']} on {ctx_action['server']} (context step)")
        ctx_result = await registry.call_tool(
            ctx_action["server"], ctx_action["tool"], ctx_action["args"]
        )
        print(ctx_result)
        context = f"{ctx_action['tool']} returned: {ctx_result}"
        actions = await plan_actions(tools, request, context=context)

    for action in actions:
        server = action["server"]
        tool_name = action["tool"]
        args = action["args"]
        print(f"▶ Calling {tool_name} on {server}")
        result = await registry.call_tool(server, tool_name, args)
        print(_format_result(tool_name, result))


if __name__ == "__main__":
    asyncio.run(main())