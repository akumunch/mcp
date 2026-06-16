from __future__ import annotations

import asyncio
import base64
import json
import os
import sys
import time
from typing import Any

import httpx
from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client
from mcp.client.streamable_http import streamable_http_client

from config import Config


class JiraMCPClientError(RuntimeError):
    pass


class JiraMCPClient:
    def __init__(self):
        self.url      = Config.ROVO_MCP_URL
        self.timeout  = Config.JIRA_MCP_TIMEOUT
        self.cloud_id = Config.ROVO_CLOUD_ID or Config.JIRA_BASE_URL
        self.transport = "stdio" if Config.ROVO_MCP_COMMAND else "http"

        if not self.cloud_id:
            raise JiraMCPClientError("ROVO_CLOUD_ID is required in .env")

    def _headers(self) -> dict[str, str]:
        """Only used for HTTP transport."""
        auth_mode = Config.ROVO_MCP_AUTH_MODE

        if auth_mode == "bearer":
            if not Config.ROVO_MCP_BEARER_TOKEN:
                raise JiraMCPClientError("ROVO_MCP_BEARER_TOKEN required.")
            return {"Authorization": f"Bearer {Config.ROVO_MCP_BEARER_TOKEN}"}

        if auth_mode == "basic":
            if not Config.JIRA_EMAIL or not Config.JIRA_API_TOKEN:
                raise JiraMCPClientError("JIRA_EMAIL and ATLASSIAN_MCP_TOKEN required.")
            token = base64.b64encode(
                f"{Config.JIRA_EMAIL}:{Config.JIRA_API_TOKEN}".encode()
            ).decode()
            return {
                "Authorization": f"Basic {token}",
                "X-Atlassian-Site": "akumunch",
            }

        return {}  # oauth / none — mcp-remote handles it

    def _stdio_params(self) -> StdioServerParameters:
        """Spawn mcp-remote as a subprocess — it handles OAuth browser login."""
        return StdioServerParameters(
            command=Config.ROVO_MCP_COMMAND,
            args=Config.ROVO_MCP_ARGS,
            env=os.environ.copy(),
        )

    def _session(self) -> "_Session":
        return _Session(self)

    def _inject_cloud_id(self, arguments: dict[str, Any]) -> dict[str, Any]:
        """Automatically inject cloudId so Gemini doesn't need to know about it."""
        args = dict(arguments)
        args.setdefault("cloudId", self.cloud_id)
        return args

    async def list_tools(self) -> list[dict[str, Any]]:
        """Discover all tools Rovo MCP exposes — no hardcoding needed."""
        async with self._session() as session:
            result = await session.list_tools()
            return [
                {
                    "name": t.name,
                    "description": getattr(t, "description", "") or "",
                    "input_schema": getattr(t, "inputSchema", None),
                }
                for t in result.tools
            ]

    async def call_tool(self, name: str, arguments: dict[str, Any]) -> str:
        """Call a Rovo MCP tool — injects cloudId automatically."""
        args = self._inject_cloud_id(arguments)
        async with self._session() as session:
            result = await session.call_tool(name, args)
            text_parts = [
                item.text
                for item in result.content
                if getattr(item, "type", None) == "text" and getattr(item, "text", None)
            ]
            return "\n".join(text_parts)


class _Session:
    """Context manager that picks stdio or HTTP transport automatically."""

    def __init__(self, client: JiraMCPClient):
        self._client = client
        self._ctx    = None

    async def __aenter__(self) -> ClientSession:
        c = self._client
        timeout = httpx.Timeout(c.timeout, read=max(c.timeout, 300))

        if c.transport == "stdio":
            params    = c._stdio_params()
            self._ctx = stdio_client(params)
            read, write = await self._ctx.__aenter__()
        else:
            self._http = httpx.AsyncClient(headers=c._headers(), timeout=timeout)
            await self._http.__aenter__()
            self._ctx = streamable_http_client(c.url, http_client=self._http)
            read, write, _ = await self._ctx.__aenter__()

        self._session = ClientSession(read, write)
        await self._session.__aenter__()
        await self._session.initialize()
        return self._session

    async def __aexit__(self, *args):
        await self._session.__aexit__(*args)
        await self._ctx.__aexit__(*args)
        if hasattr(self, "_http"):
            await self._http.__aexit__(*args)


# ── Gemini planner ────────────────────────────────────────────────────────────

def _serialize_tools(tools: list[dict]) -> str:
    lines = []
    for t in tools:
        props = (t.get("input_schema") or {}).get("properties", {})
        args = "\n".join(
            f"    - {k}: {v.get('type', 'unknown')}"
            + (f" — {v['description']}" if v.get("description") else "")
            for k, v in props.items()
            if k != "cloudId"
        )
        lines.append(
            f"Tool name: {t['name']}\n"
            f"Description: {t['description']}\n"
            f"Arguments:\n{args or '    - none'}"
        )
    return "\n\n".join(lines)


async def plan_actions(tools: list[dict], user_request: str) -> list[dict]:
    tool_list = _serialize_tools(tools)
    system = (
        "You are an MCP planning agent with access to Atlassian Rovo MCP tools.\n"
        "Given a user's natural-language request, select the correct tool and return ONLY valid JSON.\n"
        "No extra text, no markdown, no explanation.\n"
        "The default Jira project key is SCRUM — always use this unless the user specifies another.\n"
        'Return JSON in the form: {"actions":[{"tool":"tool_name","args":{...}}]}'
    )
    prompt = f"{system}\n\nAvailable tools:\n{tool_list}\n\nUser request: {user_request}"
    url = (
        f"https://generativelanguage.googleapis.com/v1/models/"
        f"{Config.GEMINI_MODEL}:generateContent?key={Config.GEMINI_API_KEY}"
    )
    payload = {
        "contents": [{"parts": [{"text": prompt}]}],
        "generationConfig": {"temperature": 0.0, "maxOutputTokens": 512},
    }

    text = ""
    last_err = None
    async with httpx.AsyncClient(timeout=30) as client:
        for attempt in range(3):
            try:
                resp = await client.post(url, json=payload)
                resp.raise_for_status()
                text = resp.json()["candidates"][0]["content"]["parts"][0]["text"]
                text = text.strip().removeprefix("```json").removeprefix("```").removesuffix("```").strip()
                break
            except Exception as exc:
                last_err = exc
                time.sleep(0.2 * (2 ** attempt))

    if not text:
        raise RuntimeError(f"Gemini failed: {last_err}")

    parsed = json.loads(text)
    print(f"🤖 Gemini planned: {json.dumps(parsed, indent=2)}")
    return parsed["actions"]


# ── Output formatter ──────────────────────────────────────────────────────────

def _format_result(tool_name: str, raw: str) -> str:
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

    client = JiraMCPClient()

    print("🔍 Discovering tools from Rovo MCP...")
    tools = await client.list_tools()
    print(f"✅ Found {len(tools)} tools")

    actions = await plan_actions(tools, request)

    for action in actions:
        tool_name = action["tool"]
        args      = action["args"]
        print(f"▶ Calling: {tool_name}")
        result = await client.call_tool(tool_name, args)
        print(_format_result(tool_name, result))


if __name__ == "__main__":
    asyncio.run(main())