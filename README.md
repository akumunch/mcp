# Personal MCP Agent

An intelligent Python-based agent that uses Google Gemini as a planner to route natural-language requests across three MCP servers: **Jira**, **Google Calendar**, and **Slack**.

## Setup

1. Copy `.env.example` to `.env`
2. Fill in your credentials (see sections below for each service)
3. Install dependencies:
```bash
pip install -r requirements.txt
```

## Architecture

```
┌─────────────────────────────────────┐
│  Python Agent (agent.py)            │
│  • CLI interface                    │
│  • Gemini planner & re-planner      │
└────────────────┬────────────────────┘
                 │
     ┌───────────▼───────────┐
     │  Tool Registry         │
     │  (registry.py)         │
     │  • Discovers tools     │
     │    across all servers  │
     └───────────┬────────────┘
                 │
   ┌─────────────┼──────────────┐
   │             │              │
┌──▼───┐    ┌────▼─────┐   ┌────▼────┐
│ Jira │    │ Google   │   │ Slack   │
│ MCP  │    │ Calendar │   │ MCP     │
│      │    │ MCP      │   │         │
└──────┘    └──────────┘   └─────────┘
```

- **mcp_base.py** — generic stdio/HTTP MCP client
- **registry.py** — discovers tools across all servers
- **config.py** — loads environment variables via `python-dotenv`
- **jira_mcp.py / slack_mcp.py / google_calendar_mcp.py** — per-server client subclasses
- **agent.py** — main CLI entry point; runs Gemini planning (with automatic re-planning when a context-gathering tool like `get-current-time` is needed first), validates the plan against each tool's real JSON schema, executes, and formats output

## Services

### Jira (via Atlassian Rovo MCP)

Connects over HTTP to Atlassian's Rovo MCP endpoint.

| Variable | Description | Required |
|---|---|---|
| `JIRA_EMAIL` | Your Atlassian account email | Yes |
| `ATLASSIAN_MCP_TOKEN` | API token from id.atlassian.com | Yes |
| `JIRA_BASE_URL` | Your Jira site URL (e.g. `https://yoursite.atlassian.net`) | Optional |
| `ROVO_CLOUD_ID` | Cloud ID for Rovo MCP (overrides `JIRA_BASE_URL`) | Recommended |
| `ROVO_MCP_URL` | Rovo MCP endpoint | Default: `https://mcp.atlassian.com/v1/mcp` |

The default project key used by the planner is `SCRUM` — set in `agent.py`'s system prompt, change there if your project key differs.

**31 tools** discovered, including `searchJiraIssuesUsingJql`, `getIssue`, `createIssue`, `editJiraIssue`, `addCommentToJiraIssue`, `addWorklogToJiraIssue`.

```bash
python agent.py "show me all open SCRUM issues"
python agent.py "create a bug for OAuth failures"
```

### Google Calendar (via `@cocal/google-calendar-mcp`)

This server handles its own OAuth flow — the Python client does **not** manage tokens directly.

**One-time setup:**

1. In [Google Cloud Console](https://console.cloud.google.com), create a project (or use an existing one) and enable the **Google Calendar API**: `APIs & Services → Library → Google Calendar API → Enable`.
2. Under `APIs & Services → Credentials`, create an OAuth client of type **Desktop app** (not Web application — Desktop apps let Google treat `http://localhost` as a loopback wildcard, avoiding exact port/path matching issues).
3. Under `APIs & Services → Audience` (formerly "OAuth consent screen"), add your Google account as a **test user** if the app is in testing mode.
4. Download the OAuth client credentials JSON and save it somewhere referenced by `GOOGLE_OAUTH_CREDENTIALS` below.

| Variable | Description |
|---|---|
| `GOOGLE_CALENDAR_MCP_COMMAND` | Command to launch the server, e.g. `npx` |
| `GOOGLE_CALENDAR_MCP_ARGS` | Args for the command, e.g. `-y @cocal/google-calendar-mcp` |
| `GOOGLE_OAUTH_CREDENTIALS` | Absolute path to your downloaded OAuth client credentials JSON |

**Connecting an account:**

Either via the agent:
```bash
python agent.py "add my google account using manage-accounts, call it 'personal'"
```
…then visit the printed `auth_url` in your browser **within the 5-minute window** and complete consent.

Or directly via the package's own CLI (recommended — keeps the local callback server alive in the foreground until you finish, avoiding issues where a short-lived agent process exits before you've completed the browser flow):
```bash
npx -y @cocal/google-calendar-mcp auth
```

Tokens are stored at `~/.config/google-calendar-mcp/tokens.json` (Windows: `C:\Users\<you>\.config\google-calendar-mcp\tokens.json`). In test-mode OAuth apps, tokens expire after 7 days — re-auth with `manage-accounts` (`action: add`) or the `auth` command above.

**13 tools** discovered, including `manage-accounts`, `list-calendars`, `list-events`, `get-current-time`, `create-event`.

```bash
python agent.py "list my connected google accounts using manage-accounts"
python agent.py "list my google calendar events for this week"
```

> Relative dates ("this week," "today") work via automatic two-step planning: the agent first calls `get-current-time`, then re-plans the actual request using that result as grounding context.

### Slack (official Slack MCP server)

Connects over HTTP to Slack's official MCP endpoint.

| Variable | Description | Required |
|---|---|---|
| `SLACK_USER_TOKEN` | A Slack user OAuth token (`xoxp-...`) | Yes |

**12 tools** discovered. The planner is instructed to prefer `slack_post_message` for sending messages over `slack_list_channels`.

```bash
python agent.py "post 'standup at 10am' to #general"
python agent.py "list my slack channels"
```

### Gemini Planner

| Variable | Description | Required |
|---|---|---|
| `GEMINI_API_KEY` | Google Gemini API key | Yes |
| `GEMINI_MODEL` | Gemini model, e.g. `gemini-2.5-flash` | No, defaults to `gemini-2.5-flash` |

The planner calls Gemini's `v1beta` endpoint with `responseMimeType: "application/json"` (structured JSON mode). It does **not** use `responseSchema` — an object schema with no declared properties was found to bias the structured decoder toward emitting an empty/trivial `args: {}` regardless of the prompt.

Plans are validated against each tool's real `input_schema` using `jsonschema`. On validation failure, the agent retries up to 3 times with escalating temperature (0.0 → 0.4), feeding Gemini its own validation errors so it can self-correct.

## Usage

```bash
python agent.py "<natural language request>"
```

The agent will:
1. **Discover** all available tools across Jira, Google Calendar, and Slack
2. **Plan** the best tool(s) using Gemini, validating against real schemas
3. **Re-plan** automatically if a context-gathering step (like `get-current-time`) is needed first
4. **Execute** the planned action(s)
5. **Format** results for readability

## Requirements

- Python 3.8+
- Node.js 18+ (for the Google Calendar MCP server, run via `npx`)
- `httpx`, `jsonschema`, `python-dotenv`

## Project Structure

```
.
├── agent.py                  # Main CLI agent + Gemini planner
├── config.py                 # Environment variable loading
├── registry.py                # Tool discovery across all MCP servers
├── mcp_base.py                # Generic stdio/HTTP MCP client
├── jira_mcp.py                 # Jira (Rovo) client
├── google_calendar_mcp.py       # Google Calendar client
├── slack_mcp.py                  # Slack client
├── README.md
└── .env.example
```

## Notes

- This project is separate from any other repo using similar filenames (e.g. an internship PPM/LangGraph project) — different codebase, coincidental naming.
- `mcp_base.py`'s stdio clients spawn subprocesses with `env=os.environ.copy()` — environment variable names must match exactly what each npm package expects, not just what your internal `Config` class calls them.
- Never paste API keys or tokens into terminal output, logs, or chat sessions in plaintext. If a key is ever exposed, rotate it immediately at its source (e.g. Google AI Studio for Gemini keys).