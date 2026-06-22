from __future__ import annotations

import os
from typing import Any

import httpx
from mcp.client.session import ClientSession
from mcp import StdioServerParameters
from mcp.client.stdio import stdio_client
from mcp.client.streamable_http import streamable_http_client

class BaseMCPClient:
    """Generic reusable MCP client — subclass this for each server."""

    def __init__(self, url: str, auth_headers: dict, command: str = "", args: list[str] = [], timeout: int = 30):
        self.url = url
        self.auth_headers = auth_headers
        self.timeout = timeout
        self.transport = "stdio" if command else "http"
        self.command = command
        self.args = args

    def _session(self):
        return _Session(self)

    async def list_tools(self) -> list[dict[str, Any]]:
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
        async with self._session() as session:
            result = await session.call_tool(name, arguments)
            text_parts = [
                item.text
                for item in result.content
                if getattr(item, "type", None) == "text" and getattr(item, "text", None)
            ]
            return "\n".join(text_parts)

class _Session:
    def __init__(self, client: BaseMCPClient):
        self._client = client
        self._ctx = None

    async def __aenter__(self) -> ClientSession:
        c = self._client
        timeout = httpx.Timeout(c.timeout, read=max(c.timeout, 300))

        if c.transport == "stdio":
            params = StdioServerParameters(command=c.command, args=c.args, env=os.environ.copy())
            self._ctx = stdio_client(params)
            read, write = await self._ctx.__aenter__()
        else:
            self._http = httpx.AsyncClient(headers=c.auth_headers, timeout=timeout)
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