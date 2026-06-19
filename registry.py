from __future__ import annotations

from typing import Any

from jira_mcp import JiraMCPClient
from google_calendar_mcp import GoogleCalendarMCPClient
from slack_mcp import SlackMCPClient
from config import Config


class MCPRegistry:
    def __init__(self):
        self.clients = {}
        self._register_clients()

    def _register_clients(self):
        self.clients["jira"] = JiraMCPClient()

        if Config.GOOGLE_CALENDAR_MCP_COMMAND or Config.GOOGLE_CALENDAR_MCP_URL:
            self.clients["google_calendar"] = GoogleCalendarMCPClient()

        if Config.SLACK_MCP_COMMAND or Config.SLACK_MCP_URL:
            self.clients["slack"] = SlackMCPClient()

    async def discover_all_tools(self) -> list[dict[str, Any]]:
        """Get tools from all registered servers, tagged with server name."""
        all_tools = []
        for server_name, client in self.clients.items():
            try:
                tools = await client.list_tools()
                for tool in tools:
                    tool["server"] = server_name
                all_tools.extend(tools)
                print(f"✅ {server_name}: {len(tools)} tools")
            except Exception as e:
                print(f"⚠️ {server_name} unavailable: {e}")
        return all_tools

    async def call_tool(self, server: str, tool: str, args: dict[str, Any]) -> str:
        if server not in self.clients:
            raise ValueError(f"Unknown server: {server}")
        return await self.clients[server].call_tool(tool, args)