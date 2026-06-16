from __future__ import annotations
import os
from dotenv import load_dotenv

load_dotenv()

class Config:
    # Jira
    JIRA_EMAIL        = os.getenv("JIRA_EMAIL", "")
    JIRA_API_TOKEN    = os.getenv("ATLASSIAN_MCP_TOKEN", "")
    JIRA_BASE_URL     = os.getenv("JIRA_BASE_URL", "")
    JIRA_MCP_MODE     = os.getenv("JIRA_MCP_MODE", "rovo")
    JIRA_MCP_TIMEOUT  = int(os.getenv("JIRA_MCP_TIMEOUT", "30"))

    # Rovo MCP
    ROVO_MCP_URL        = os.getenv("ROVO_MCP_URL", "https://mcp.atlassian.com/v1/mcp")
    ROVO_MCP_AUTH_MODE  = os.getenv("ROVO_MCP_AUTH_MODE", "basic")
    ROVO_MCP_BEARER_TOKEN = os.getenv("ROVO_MCP_BEARER_TOKEN", "")
    ROVO_MCP_COMMAND    = os.getenv("ROVO_MCP_COMMAND", "")
    ROVO_MCP_ARGS       = os.getenv("ROVO_MCP_ARGS", "").split() 
    ROVO_MCP_TOOL_MAP: dict = {}
    ROVO_CLOUD_ID       = os.getenv("ROVO_CLOUD_ID", "")

    # Gemini
    GEMINI_API_KEY   = os.getenv("GEMINI_API_KEY", "")
    GEMINI_MODEL     = os.getenv("GEMINI_MODEL_NAME", "gemini-2.5-flash")