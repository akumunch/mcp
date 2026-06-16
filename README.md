# Jira MCP Agent

An intelligent Python-based MCP agent that leverages Atlassian Rovo MCP for seamless Jira integration. Combines natural language processing via Google Gemini with Jira's MCP tools to enable intuitive task management, issue search, and workflow automation.

## Setup

1. Copy `.env.example` to `.env`
2. Fill in your credentials:

### Atlassian / Jira Configuration

| Variable | Description | Required |
|---|---|---|
| `JIRA_EMAIL` | Your Atlassian account email | Yes (for Basic auth) |
| `ATLASSIAN_MCP_TOKEN` | API token from id.atlassian.com | Yes (for Basic auth) |
| `JIRA_BASE_URL` | Your Jira site URL (e.g. `https://yoursite.atlassian.net`) | Optional |
| `ROVO_CLOUD_ID` | Cloud ID for Rovo MCP (overrides JIRA_BASE_URL) | Recommended |

### Rovo MCP Configuration

| Variable | Description | Default |
|---|---|---|
| `ROVO_MCP_URL` | Rovo MCP endpoint | `https://mcp.atlassian.com/v1/mcp` |
| `ROVO_MCP_AUTH_MODE` | Authentication mode (`basic`, `bearer`, or `oauth`) | `basic` |
| `ROVO_MCP_BEARER_TOKEN` | Bearer token for token-based auth | - |
| `ROVO_MCP_COMMAND` | Command to run mcp-remote (for stdio transport) | - |
| `ROVO_MCP_ARGS` | Arguments for mcp-remote | - |

### AI Planner Configuration

| Variable | Description | Required |
|---|---|---|
| `GEMINI_API_KEY` | Google Gemini API key | Yes |
| `GEMINI_MODEL_NAME` | Gemini model (e.g. `gemini-2.5-flash`) | No, defaults to `gemini-2.5-flash` |

3. Install dependencies:
```bash
pip install -r requirements.txt
npm install
```

## Usage

### Python Agent CLI

Run natural language commands to interact with Jira:

```bash
python agent.py "create a bug for OAuth failures"
python agent.py "show me all open SCRUM issues"
python agent.py "get issue SCRUM-1"
python agent.py "find tickets related to authentication"
python agent.py "update SCRUM-123 and add a comment saying completed"
```

The agent automatically:
- **Discovers** all available Rovo MCP tools
- **Plans** the best tool(s) to use for your request using Gemini AI
- **Executes** the actions with proper parameters
- **Formats** the results for easy reading

### Transport Modes

The agent supports two connection modes:

#### 1. **HTTP Transport** (Default)
Direct HTTP connection to Rovo MCP with Basic or Bearer authentication.

```env
ROVO_MCP_AUTH_MODE=basic
# or
ROVO_MCP_AUTH_MODE=bearer
ROVO_MCP_BEARER_TOKEN=your_token
```

#### 2. **Stdio Transport** (OAuth Support)
Spawns `mcp-remote` for OAuth-based authentication with browser login.

```env
ROVO_MCP_COMMAND=mcp-remote
ROVO_MCP_ARGS=--protocol-version 2024-11-05 --auth oauth
```

## Available Tools

The agent automatically discovers all tools from Atlassian Rovo MCP. Common tools include:

- **searchJiraIssuesUsingJql** — Search Jira issues using JQL filters or natural language
- **getIssue** — Retrieve detailed information about a specific Jira issue
- **createIssue** — Create a new Jira issue with title, description, type, priority, labels
- **updateIssue** — Update issue summary, description, status, priority, labels, or add comments
- **editJiraIssue** — Edit existing Jira issue fields
- **addWorklogToJiraIssue** — Add time tracking entries to issues
- **addCommentToJiraIssue** — Add comments to issues

For the complete list of available tools, run:
```bash
python agent.py "list all available tools"
```

## Architecture

### How It Works

```
┌─────────────────────────────────────┐
│  Python Agent (agent.py)            │
│  • CLI interface                    │
│  • Argument parsing                 │
└────────────────┬────────────────────┘
                 │
     ┌───────────▼───────────┐
     │  Jira MCP Client      │
     │  • Tool discovery     │
     │  • Transport selection│
     └───────────┬───────────┘
                 │
     ┌───────────▼──────────────────┐
     │  Gemini Planner Agent        │
     │  • Intent understanding      │
     │  • Tool selection & planning │
     │  • Argument generation       │
     └───────────┬──────────────────┘
                 │
     ┌───────────▼──────────────────────────────┐
     │  Atlassian Rovo MCP                      │
     │  (HTTP or Stdio Transport)               │
     │  • Auth: Basic, Bearer, or OAuth         │
     └───────────┬──────────────────────────────┘
                 │
     ┌───────────▼──────────────────┐
     │  Jira Cloud (Atlassian)      │
     │  • Issues                    │
     │  • Comments                  │
     │  • Time tracking             │
     └──────────────────────────────┘
```

### Key Components

1. **agent.py** — Main CLI entry point
   - Parses natural language requests
   - Orchestrates the MCP client and Gemini planner
   - Formats and displays results

2. **config.py** — Configuration management
   - Loads environment variables
   - Supports multiple auth modes
   - Configures transport selection

3. **Jira MCP Client** — Handles communication
   - Supports HTTP and stdio transports
   - Auto-injects cloud ID for tool calls
   - Manages session lifecycle

## Development

### Python Agent Development

```bash
# Run agent locally
python agent.py "your request here"

# Debug mode (see planning output)
python agent.py "list all tools"
```

### Requirements

- Python 3.8+
- Node.js 18+ (optional, for legacy TypeScript components)
- `httpx` — Async HTTP client for Rovo MCP communication
- `google-generativeai` or direct API calls — For Gemini planning
- `python-dotenv` — For environment configuration

### Project Structure

```
.
├── agent.py           # Main CLI agent
├── config.py          # Configuration management
├── package.json       # Node.js dependencies (legacy)
├── README.md          # This file
├── .env.example       # Environment template
└── node_modules/      # TypeScript server (legacy, not used by Python agent)
```

## Technical Details

- **MCP Protocol** — Uses Model Context Protocol to communicate with Atlassian Rovo MCP
- **Transport** — Supports both HTTP (direct) and stdio (subprocess) transports
- **Authentication**:
  - **Basic Auth** — Email + API token (no browser needed)
  - **Bearer Token** — Direct token-based auth
  - **OAuth** — Browser-based login via mcp-remote
- **LLM Planner** — Google Gemini 2.5 Flash analyzes requests and selects optimal tools
- **Cloud ID Injection** — Automatically injects cloudId into all tool calls, simplifying requests
- **Async/Await** — Full async implementation for fast, non-blocking I/O
- **Dynamic Tool Discovery** — Automatically adapts to new Rovo MCP tools without code changes

## Example Workflows

### 1. Create and Link an Issue
```bash
python agent.py "create a critical bug about login failures"
```

### 2. Search and Update
```bash
python agent.py "find all SCRUM issues assigned to me"
python agent.py "update SCRUM-456 to in progress and add comment saying started work"
```

### 3. Bulk Operations
```bash
python agent.py "show all high priority issues in the current sprint"
```