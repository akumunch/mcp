from __future__ import annotations

import asyncio
import base64
import json
import os
import sys
import time
from typing import Any

import httpx
from dotenv import load_dotenv
from jsonschema import validate, ValidationError
from mcp import ClientSession
from mcp.client.streamable_http import streamable_http_client

load_dotenv()

# ── Config ────────────────────────────────────────────────────────────────────

GEMINI_API_KEY = os.environ["GEMINI_API_KEY"]
GEMINI_MODEL   = os.getenv("GEMINI_MODEL_NAME", "gemini-2.5-flash")
JIRA_EMAIL     = os.environ["JIRA_EMAIL"]
MCP_TOKEN      = os.environ["ATLASSIAN_MCP_TOKEN"]
ROVO_MCP_URL   = "https://mcp.atlassian.com/v1/mcp"
CLOUD_ID       = "a7c3d83b-aa08-493d-89f7-205e009e21a4"

TOOL_LIST = """
Tool name: searchJiraIssuesUsingJql
Description: Search for Jira issues using JQL query language.
Arguments:
    - cloudId: string — ALWAYS use "a7c3d83b-aa08-493d-89f7-205e009e21a4"
    - jql: string — JQL query e.g. "project = SCRUM ORDER BY created DESC"
    - maxResults: number — max number of results to return (default 10)

Tool name: createJiraIssue
Description: Create a new Jira issue.
Arguments:
    - cloudId: string — ALWAYS use "a7c3d83b-aa08-493d-89f7-205e009e21a4"
    - projectKey: string — the project key e.g. "SCRUM"
    - summary: string — the issue title
    - issueTypeName: string — e.g. "Task", "Bug", "Story"

Tool name: getJiraIssue
Description: Get a specific Jira issue by its key.
Arguments:
    - cloudId: string — ALWAYS use "a7c3d83b-aa08-493d-89f7-205e009e21a4"
    - issueIdOrKey: string — e.g. "SCRUM-9"

Tool name: editJiraIssue
Description: Update an existing Jira issue.
Arguments:
    - cloudId: string — ALWAYS use "a7c3d83b-aa08-493d-89f7-205e009e21a4"
    - issueIdOrKey: string — e.g. "SCRUM-9"
    - fields: object — fields to update, e.g. {"summary": "new title"}

Tool name: addCommentToJiraIssue
Description: Add a comment to a Jira issue.
Arguments:
    - cloudId: string — ALWAYS use "a7c3d83b-aa08-493d-89f7-205e009e21a4"
    - issueIdOrKey: string — e.g. "SCRUM-9"
    - body: string — the comment text
"""

# ── Planner schema (equivalent to your Ajv plannerSchema) ────────────────────

PLANNER_SCHEMA = {
    "type": "object",
    "properties": {
        "actions": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "tool": {"type": "string"},
                    "args": {"type": "object"},
                },
                "required": ["tool", "args"],
                "additionalProperties": False,
            },
        }
    },
    "required": ["actions"],
    "additionalProperties": False,
}

# ── Gemini planner ────────────────────────────────────────────────────────────

SYSTEM_MESSAGE = """You are an MCP planning agent with access to Atlassian Rovo MCP tools.

Key Jira tools available:
- searchJiraIssuesUsingJql: Search for Jira issues using JQL. Use this to list/find issues.
- createJiraIssue: Create a new Jira issue.
- getJiraIssue: Get a specific Jira issue by key.
- editJiraIssue: Update an existing Jira issue.
- addCommentToJiraIssue: Add a comment to an issue.

For listing issues in a project, ALWAYS use searchJiraIssuesUsingJql.
Given a user's natural-language request, select the correct tool and return only valid JSON. No extra text."""


def sleep(ms: int) -> None:
    time.sleep(ms / 1000)


async def plan_actions(user_request: str) -> list[dict]:
    url = (
        f"https://generativelanguage.googleapis.com/v1/models/"
        f"{GEMINI_MODEL}:generateContent?key={GEMINI_API_KEY}"
    )
    payload = {
        "contents": [
            {
                "parts": [
                    {
                        "text": (
                            f"{SYSTEM_MESSAGE}\n\n"
                            f"Available tools:\n{TOOL_LIST}\n\n"
                            f"User request: {user_request}\n\n"
                            f"IMPORTANT: For listing or searching Jira issues, you MUST use "
                            f'"searchJiraIssuesUsingJql".\n\n'
                            f'Return JSON in the form: {{"actions":[{{"tool":"tool_name","args":{{...}}}}]}}.'
                        )
                    }
                ]
            }
        ],
        "generationConfig": {"temperature": 0.0, "maxOutputTokens": 512},
    }

    max_attempts = 3
    last_err = None
    text = ""

    async with httpx.AsyncClient(timeout=30) as client:
        for attempt in range(max_attempts):
            try:
                resp = await client.post(url, json=payload)
                resp.raise_for_status()
                data = resp.json()
                text = data["candidates"][0]["content"]["parts"][0]["text"]
                # Strip markdown code fences if Gemini wraps the JSON
                text = text.strip().removeprefix("```json").removeprefix("```").removesuffix("```").strip()
                break
            except Exception as exc:
                last_err = exc
                print(f"Gemini attempt {attempt + 1} failed: {exc}", file=sys.stderr)
                sleep(200 * (2 ** attempt))  # exponential backoff

    if not text:
        raise RuntimeError(f"Gemini API failed after {max_attempts} attempts: {last_err}")

    # Parse + validate (equivalent to your Ajv validatePlanner)
    try:
        parsed = json.loads(text)
    except json.JSONDecodeError as exc:
        raise RuntimeError(f"Gemini returned invalid JSON: {exc}\nRaw:\n{text}") from exc

    try:
        validate(instance=parsed, schema=PLANNER_SCHEMA)
    except ValidationError as exc:
        raise RuntimeError(f"Planner JSON did not match schema: {exc.message}\nRaw:\n{text}") from exc

    print(f"🤖 Gemini planned: {json.dumps(parsed, indent=2)}")
    return parsed["actions"]


# ── MCP execution ─────────────────────────────────────────────────────────────

def _rovo_headers() -> dict[str, str]:
    token = base64.b64encode(f"{JIRA_EMAIL}:{MCP_TOKEN}".encode()).decode()
    return {
        "Authorization": f"Basic {token}",
        "X-Atlassian-Site": "akumunch",
    }


async def execute_actions(actions: list[dict]) -> str:
    results = []
    timeout = httpx.Timeout(30, read=300)

    async with httpx.AsyncClient(headers=_rovo_headers(), timeout=timeout) as http_client:
        async with streamable_http_client(ROVO_MCP_URL, http_client=http_client) as (read, write, _):
            async with ClientSession(read, write) as session:
                await session.initialize()

                for action in actions:
                    tool_name = action["tool"]
                    args = action["args"]

                    print(f"▶ Calling tool: {tool_name}", file=sys.stderr)
                    result = await session.call_tool(tool_name, args)

                    text_parts = [
                        item.text
                        for item in result.content
                        if getattr(item, "type", None) == "text" and getattr(item, "text", None)
                    ]
                    raw = "\n".join(text_parts)

                    # ── Clean up Jira issue list output ──
                    if tool_name == "searchJiraIssuesUsingJql":
                        raw = _format_issues(raw)

                    results.append(f"Tool: {tool_name}\nResult:\n{raw}")

    return "\n\n".join(results)


def _format_issues(raw: str) -> str:
    """Strip Jira noise — return only key, summary, status."""
    try:
        data = json.loads(raw)
        issues = data.get("issues", [])
        lines = []
        for issue in issues:
            key = issue.get("key", "?")
            summary = issue["fields"].get("summary", "?")
            status = issue["fields"]["status"].get("name", "?")
            lines.append(f"{key} — {summary} ({status})")
        return "\n".join(lines) if lines else "No issues found."
    except Exception:
        return raw  # fallback to raw if parsing fails


# ── Main ──────────────────────────────────────────────────────────────────────

async def main() -> None:
    request = " ".join(sys.argv[1:]).strip()
    if not request:
        print('Usage: python agent.py "<natural language request>"', file=sys.stderr)
        sys.exit(1)

    actions = await plan_actions(request)
    if not actions:
        raise RuntimeError("Planner returned no actions.")

    result = await execute_actions(actions)
    print(result)


if __name__ == "__main__":
    asyncio.run(main())