from __future__ import annotations

from config import Config
from mcp_base import BaseMCPClient


class GoogleCalendarMCPClient(BaseMCPClient):
    def __init__(self):
        super().__init__(
            url=Config.GOOGLE_CALENDAR_MCP_URL,
            auth_headers={},
            command=Config.GOOGLE_CALENDAR_MCP_COMMAND,
            args=Config.GOOGLE_CALENDAR_MCP_ARGS,
            timeout=30,
        )