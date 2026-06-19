from __future__ import annotations

import base64
from typing import Any

from config import Config
from mcp_base import BaseMCPClient

class JiraMCPClient(BaseMCPClient):
    def __init__(self):
        self.cloud_id = Config.ROVO_CLOUD_ID or Config.JIRA_BASE_URL
        if not self.cloud_id:
            raise ValueError("ROVO_CLOUD_ID is required in .env")

        super().__init__(
            url=Config.ROVO_MCP_URL,
            auth_headers=self._build_headers(),
            command=Config.ROVO_MCP_COMMAND,
            args=Config.ROVO_MCP_ARGS,
            timeout=Config.JIRA_MCP_TIMEOUT,
        )

    def _build_headers(self) -> dict:
        mode = Config.ROVO_MCP_AUTH_MODE
        if mode == "bearer":
            return {"Authorization": f"Bearer {Config.ROVO_MCP_BEARER_TOKEN}"}
        if mode == "basic":
            token = base64.b64encode(
                f"{Config.JIRA_EMAIL}:{Config.JIRA_API_TOKEN}".encode()
            ).decode()
            return {
                "Authorization": f"Basic {token}",
                "X-Atlassian-Site": "akumunch",
            }
        return {}

    async def call_tool(self, name: str, arguments: dict[str, Any]) -> str:
        # Inject cloudId for Jira only
        args = dict(arguments)
        args.setdefault("cloudId", self.cloud_id)
        return await super().call_tool(name, args)