# Jira MCP Server

A custom Model Context Protocol (MCP) server for Jira that provides tools for searching, retrieving, creating, and updating issues. Also includes a GitHub-Jira orchestrator for creating linked tickets across both platforms simultaneously.

## Setup

1. Copy `.env.example` to `.env`
2. Fill in your credentials:

| Variable | Description |
|---|---|
| `JIRA_BASE_URL` | Your Jira site URL (e.g. `https://yoursite.atlassian.net`) |
| `JIRA_EMAIL` | Your Atlassian account email |
| `JIRA_API_TOKEN` | API token from id.atlassian.com |
| `JIRA_PROJECT_KEY` | Your project key (e.g. `SCRUM`) |
| `GITHUB_PERSONAL_ACCESS_TOKEN` | GitHub PAT with `repo` scope |
| `GITHUB_REPO_OWNER` | GitHub username |
| `GITHUB_REPO_NAME` | Repository name |

3. Install dependencies and build:
```bash
   npm install && npm run build
```

## MCP Server Usage

### VS Code (Copilot)
Add to your `mcp.json`:
```json
{
  "servers": {
    "jira-mcp-server": {
      "type": "stdio",
      "command": "node",
      "args": ["/path/to/dist/server.js"]
    }
  }
}
```

### Claude Desktop
Add to `claude_desktop_config.json`:
```json
{
  "mcpServers": {
    "jira": {
      "command": "node",
      "args": ["/path/to/dist/server.js"]
    }
  }
}
```

### Testing with MCP Inspector
```bash
npx @modelcontextprotocol/inspector node dist/server.js
```

## Available Tools

- **search_issues** — Search Jira issues using JQL
- **get_issue** — Get details of a specific issue by key (e.g. `SCRUM-1`)
- **create_issue** — Create a new Jira issue
- **update_issue** — Update an existing issue

## GitHub-Jira Orchestrator

Creates a linked ticket in both GitHub and Jira with a single command:

```bash
node dist/orchestrator.js "Issue title" "Description"
```

## Development

```bash
npm run dev   # run with auto-reload
npm run build # compile TypeScript
```

## Notes

- Uses stdio transport (JSON-RPC over stdin/stdout)
- Jira API v3 with Basic Auth (email + API token)
- Description fields use Atlassian Document Format (ADF)