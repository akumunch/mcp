import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
  Tool,
} from "@modelcontextprotocol/sdk/types.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { jiraConfig } from "./config.js";
import { JiraConnector, JiraIssueFields } from "./jiraConnector.js";

const server = new Server({
  name: "jira-mcp-server",
  version: "0.1.0",
}, {
  capabilities: {
    tools: {}
  }
});

const jira = new JiraConnector();

// Define MCP tools
const tools: Tool[] = [
  {
    name: "search_issues",
    description: "Search for Jira issues using JQL query",
    inputSchema: {
      type: "object",
      properties: {
        jql: {
          type: "string",
          description: "JQL query string (e.g., 'project = SCRUM')",
        },
        maxResults: {
          type: "number",
          description: "Maximum number of results to return",
          default: 50,
        },
      },
      required: ["jql"],
    },
  },
  {
    name: "get_issue",
    description: "Get details of a specific Jira issue",
    inputSchema: {
      type: "object",
      properties: {
        issueId: {
          type: "string",
          description: "Issue ID or key (e.g., 'SCRUM-123')",
        },
      },
      required: ["issueId"],
    },
  },
  {
    name: "create_issue",
    description: "Create a new Jira issue",
    inputSchema: {
      type: "object",
      properties: {
        summary: {
          type: "string",
          description: "Issue summary/title",
        },
        description: {
          type: "string",
          description: "Issue description",
        },
        issueType: {
          type: "string",
          description: "Issue type name (e.g., 'Task', 'Bug', 'Story')",
        },
      },
      required: ["summary", "issueType"],
    },
  },
  {
    name: "update_issue",
    description: "Update an existing Jira issue",
    inputSchema: {
      type: "object",
      properties: {
        issueId: {
          type: "string",
          description: "Issue ID or key",
        },
        summary: {
          type: "string",
          description: "New issue summary",
        },
        description: {
          type: "string",
          description: "New issue description",
        },
      },
      required: ["issueId"],
    },
  },
];

// Handler for listing available tools
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools,
}));

// Handler for calling tools
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  try {
    const { name, arguments: args } = request.params;

    switch (name) {
      case "search_issues": {
        const jql = (args?.jql as string) || `project = ${jiraConfig.projectKey}`;
        const maxResults = (args?.maxResults as number) || 50;
        const result = await jira.searchIssues(jql, maxResults);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      case "get_issue": {
        const issueId = args?.issueId as string;
        if (!issueId) {
          return {
            content: [
              {
                type: "text",
                text: "Error: issueId is required",
              },
            ],
            isError: true,
          };
        }
        const issue = await jira.getIssue(issueId);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(issue, null, 2),
            },
          ],
        };
      }

      case "create_issue": {
        const summary = args?.summary as string;
        const description = args?.description as string;
        const issueType = args?.issueType as string;

        if (!summary || !issueType) {
          return {
            content: [
              {
                type: "text",
                text: "Error: summary and issueType are required",
              },
            ],
            isError: true,
          };
        }

        const fields: JiraIssueFields = {
          summary,
          description,
          issuetype: { name: issueType },
          project: { key: jiraConfig.projectKey },
        };

        const issue = await jira.createIssue(fields);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(issue, null, 2),
            },
          ],
        };
      }

      case "update_issue": {
        const issueId = args?.issueId as string;
        const summary = args?.summary as string;
        const description = args?.description as string;

        if (!issueId) {
          return {
            content: [
              {
                type: "text",
                text: "Error: issueId is required",
              },
            ],
            isError: true,
          };
        }

        const updates: Partial<JiraIssueFields> = {};
        if (summary) updates.summary = summary;
        if (description) updates.description = description;

        await jira.updateIssue(issueId, updates);
        return {
          content: [
            {
              type: "text",
              text: `Issue ${issueId} updated successfully`,
            },
          ],
        };
      }

      default:
        return {
          content: [
            {
              type: "text",
              text: `Unknown tool: ${name}`,
            },
          ],
          isError: true,
        };
    }
  } catch (error) {
    return {
      content: [
        {
          type: "text",
          text: `Error: ${String(error)}`,
        },
      ],
      isError: true,
    };
  }
});

// Start the server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Jira MCP server running on stdio");
}

main().catch(console.error);
