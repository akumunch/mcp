from __future__ import annotations

from config import Config
from mcp_base import BaseMCPClient


class SlackMCPClient(BaseMCPClient):
    def __init__(self):
        super().__init__(
            url=Config.SLACK_MCP_URL,
            auth_headers={"Authorization": f"Bearer {Config.SLACK_USER_TOKEN}"},
            command=Config.SLACK_MCP_COMMAND,
            args=Config.SLACK_MCP_ARGS,
            timeout=30,
        )