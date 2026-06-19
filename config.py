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

    #Google Calendar
    GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID", "")
    GOOGLE_CLIENT_SECRET = os.getenv("GOOGLE_CLIENT_SECRET", "")
    GOOGLE_REDIRECT_URI = os.getenv("GOOGLE_REDIRECT_URI", "")
    GOOGLE_OAUTH_CREDENTIALS = os.getenv("GOOGLE_OAUTH_CREDENTIALS", "")
    GOOGLE_CALENDAR_SCOPES = os.getenv("GOOGLE_CALENDAR_SCOPES", "")
    GOOGLE_CALENDAR_TOKEN_PATH = os.getenv("GOOGLE_CALENDAR_TOKEN_PATH", "")
    GOOGLE_CALENDAR_MCP_URL     = os.getenv("GOOGLE_CALENDAR_MCP_URL", "")
    GOOGLE_CALENDAR_MCP_COMMAND = os.getenv("GOOGLE_CALENDAR_MCP_COMMAND", "")
    GOOGLE_CALENDAR_MCP_ARGS    = os.getenv("GOOGLE_CALENDAR_MCP_ARGS", "").split()

    #Slack
    SLACK_CLIENT_ID = os.getenv("SLACK_CLIENT_ID", "")
    SLACK_CLIENT_SECRET = os.getenv("SLACK_CLIENT_SECRET", "")
    SLACK_REDIRECT_URI = os.getenv("SLACK_REDIRECT_URI", "")
    SLACK_USER_TOKEN= os.getenv("SLACK_USER_TOKEN", "")
    SLACK_SCOPES = os.getenv("SLACK_SCOPES", "")
    SLACK_TEAM_ID = os.getenv("SLACK_TEAM_ID", "")
    SLACK_TOKEN_PATH = os.getenv("SLACK_TOKEN_PATH", "")
    SLACK_MCP_URL     = os.getenv("SLACK_MCP_URL", "")
    SLACK_MCP_COMMAND = os.getenv("SLACK_MCP_COMMAND", "")
    SLACK_MCP_ARGS    = os.getenv("SLACK_MCP_ARGS", "").split()
    SLACK_BOT_TOKEN   = os.getenv("SLACK_BOT_TOKEN", "")

    # Gemini
    GEMINI_API_KEY   = os.getenv("GEMINI_API_KEY", "")
    GEMINI_MODEL     = os.getenv("GEMINI_MODEL_NAME", "gemini-2.5-flash")