# Jira MCP Server

I created my own workplace in Jira (https://akumunch.atlassian.net). This is a Model Context Protocol (MCP) server for Jira that provides tools for searching, retrieving, creating, and updating issues.

## Setup

1. Copy `.env.example` to `.env`.
2. Fill in `JIRA_BASE_URL`, `JIRA_EMAIL`, `JIRA_API_TOKEN`, and `JIRA_PROJECT_KEY`.
3. Install dependencies:
   ```bash
   npm install
   ```
4. Build the project:
   ```bash
   npm run build
   ```

## Usage

This is an MCP server designed to be used with Claude or other MCP clients.

### Local Testing
```bash
npm start
```

### Integration with Claude

Add to your `claude_desktop_config.json`:
```json
{
  "mcpServers": {
    "jira": {
      "command": "node",
      "args": ["/path/to/dist/server.js"],
      "env": {
        "JIRA_BASE_URL": "https://akumunch.atlassian.net",
        "JIRA_EMAIL": "your-email@example.com",
        "JIRA_API_TOKEN": "your-api-token",
        "JIRA_PROJECT_KEY": "SCRUM"
      }
    }
  }
}
```

## Available Tools

- **search_issues** — Search for Jira issues using JQL query
  - Input: `jql` (required), `maxResults` (optional, default: 50)

- **get_issue** — Get details of a specific issue
  - Input: `issueId` (required)

- **create_issue** — Create a new Jira issue
  - Input: `summary` (required), `issueType` (required), `description` (optional)

- **update_issue** — Update an existing issue
  - Input: `issueId` (required), `summary` (optional), `description` (optional)

## Development

Run with automatic reload:
```bash
npm run dev
```

## Notes

This implementation uses:
- Model Context Protocol (MCP) v0.7.1 for standardized client-server communication
- Jira Cloud API token authentication
- JSON-RPC over stdio transport
