import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
  Tool,
} from "@modelcontextprotocol/sdk/types.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import * as Ajv from "ajv";
import * as addFormats from "ajv-formats";
import { jiraConfig } from "./config.js";
import { JiraConnector, JiraIssueFields } from "./jiraConnector.js";

const server = new Server(
  {
    name: "jira-mcp-server",
    version: "0.2.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

const jira = new JiraConnector();

const tools: Tool[] = [
  {
    name: "search_issues",
    description:
      "Search Jira issues by a natural-language filter or JQL. Returns summary, key, status, assignee, priority, labels, and a text snippet from the description.",
    inputSchema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description:
            "Natural-language search filters such as status, sprint, assignee, label, priority, or a free-text search. Example: 'open sprint issues involving authentication'.",
        },
        jql: {
          type: "string",
          description:
            "Optional Jira Query Language expression to precisely filter issues. If provided, this overrides the natural-language query.",
        },
        maxResults: {
          type: "integer",
          description: "Maximum number of issues to return.",
          default: 50,
          minimum: 1,
          maximum: 100,
        },
      },
      required: ["query"],
    },
  },
  {
    name: "get_issue",
    description:
      "Fetch the full details for a Jira issue by its ID or key. Use this when you need issue summary, description, status, priority, labels, assignee, and links.",
    inputSchema: {
      type: "object",
      properties: {
        issueIdOrKey: {
          type: "string",
          description: "Jira issue ID or key, for example SCRUM-123.",
        },
      },
      required: ["issueIdOrKey"],
    },
  },
  {
    name: "create_issue",
    description:
      "Create a Jira issue with title, description, issue type, priority, labels, sprint, assignee, and an optional natural-language request for the issue description.",
    inputSchema: {
      type: "object",
      properties: {
        summary: {
          type: "string",
          description: "The issue title.",
        },
        description: {
          type: "string",
          description: "A longer description of the problem or task.",
        },
        issueType: {
          type: "string",
          description: "Jira issue type such as Task, Bug, Story, or Epic.",
        },
        priority: {
          type: "string",
          description: "Optional priority, such as Highest, High, Medium, Low.",
        },
        labels: {
          type: "array",
          items: { type: "string" },
          description: "Optional labels to attach to the issue.",
        },
        sprint: {
          type: "string",
          description: "Optional sprint name or ID to assign the issue.",
        },
        assignee: {
          type: "string",
          description: "Optional assignee username or email.",
        },
      },
      required: ["summary", "issueType"],
    },
  },
  {
    name: "update_issue",
    description:
      "Update a Jira issue by key or ID. Use this to change summary, description, status, priority, labels, assignee, or to add a comment.",
    inputSchema: {
      type: "object",
      properties: {
        issueIdOrKey: {
          type: "string",
          description: "Jira issue ID or key, for example SCRUM-123.",
        },
        summary: {
          type: "string",
          description: "Updated issue summary.",
        },
        description: {
          type: "string",
          description: "Updated issue description.",
        },
        status: {
          type: "string",
          description: "Optional status name to transition the issue to if supported by the project workflow.",
        },
        priority: {
          type: "string",
          description: "Optional priority such as Highest, High, Medium, Low.",
        },
        labels: {
          type: "array",
          items: { type: "string" },
          description: "Optional labels to replace or add to the issue.",
        },
        assignee: {
          type: "string",
          description: "Optional assignee username or email.",
        },
        comment: {
          type: "string",
          description: "Optional comment to add to the issue.",
        },
      },
      required: ["issueIdOrKey"],
    },
  },
];

const AjvConstructor = (Ajv as any).default ?? Ajv;
const addFormatsFn = (addFormats as any).default ?? addFormats;
const ajv = new AjvConstructor({ allErrors: true, strict: false });
addFormatsFn(ajv);

function validateToolArgs(tool: Tool, args: unknown): { valid: boolean; errors?: string } {
  if (!tool.inputSchema) {
    return { valid: true };
  }
  const validate = ajv.compile(tool.inputSchema);
  const valid = validate(args);
  return {
    valid: Boolean(valid),
    errors: valid ? undefined : ajv.errorsText(validate.errors, { separator: "; " }),
  };
}

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools,
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  try {
    const tool = tools.find((tool) => tool.name === request.params.name);
    if (!tool) {
      return {
        content: [
          {
            type: "text",
            text: `Unknown tool: ${request.params.name}`,
          },
        ],
        isError: true,
      };
    }
    const validation = validateToolArgs(tool, request.params.arguments ?? {});
    if (!validation.valid) {
      return {
        content: [
          {
            type: "text",
            text: `Invalid tool arguments: ${validation.errors}`,
          },
        ],
        isError: true,
      };
    }
    const { name, arguments: args } = request.params;
    switch (name) {
      case "search_issues": {
        const query = (args?.query as string) || "";
        const jql = args?.jql as string | undefined;
        const maxResults = typeof args?.maxResults === "number" ? args.maxResults : 50;
        const result = await jira.searchIssues(query, jql, maxResults);
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
        const issueIdOrKey = args?.issueIdOrKey as string;
        if (!issueIdOrKey) {
          return {
            content: [
              {
                type: "text",
                text: "Error: issueIdOrKey is required",
              },
            ],
            isError: true,
          };
        }
        const issue = await jira.getIssue(issueIdOrKey);
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
        const priority = args?.priority as string;
        const labels = Array.isArray(args?.labels) ? args.labels.map(String) : undefined;
        const sprint = args?.sprint as string;
        const assignee = args?.assignee as string;

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
          priority: priority ? { name: priority } : undefined,
          labels,
          customfield_sprint: sprint,
          assignee: assignee ? { name: assignee } : undefined,
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
        const issueIdOrKey = args?.issueIdOrKey as string;
        if (!issueIdOrKey) {
          return {
            content: [
              {
                type: "text",
                text: "Error: issueIdOrKey is required",
              },
            ],
            isError: true,
          };
        }

        const fields: Partial<JiraIssueFields> = {};
        if (args?.summary) fields.summary = args.summary as string;
        if (args?.description) fields.description = args.description as string;
        if (args?.priority) fields.priority = { name: args.priority as string };
        if (Array.isArray(args?.labels)) fields.labels = args.labels.map(String);
        if (args?.assignee) fields.assignee = { name: args.assignee as string };
        if (args?.sprint) fields.customfield_sprint = args.sprint as string;

        const comment = args?.comment as string | undefined;
        await jira.updateIssue(issueIdOrKey, fields, comment);
        return {
          content: [
            {
              type: "text",
              text: `Issue ${issueIdOrKey} updated successfully`,
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

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Jira MCP server running on stdio");
}

main().catch(console.error);
