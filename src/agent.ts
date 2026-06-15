import * as Ajv from "ajv";
import * as addFormats from "ajv-formats";
import axios from "axios";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { geminiConfig } from "./config.js";
import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import AjvCore from "ajv";

interface PlannedAction {
  tool: string;
  args: Record<string, unknown>;
}

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

function serializeToolsForPrompt(tools: Tool[]): string {
  return tools
    .map((tool) => {
      const props = tool.inputSchema?.properties ?? {};
      const args = Object.entries(props)
        .map(([key, schema]) => {
          const typed = schema as any;
          return `    - ${key}: ${typed.type ?? "unknown"}${typed.description ? ` — ${typed.description}` : ""}`;
        })
        .join("\n");

      return `Tool name: ${tool.name}\nDescription: ${tool.description ?? "No description."}\nArguments:\n${args || "    - none"}`;
    })
    .join("\n\n");
}

function extractTextFromGenAIResponse(data: any): string {
  if (!data) return "";

  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;

  if (!text) {
    return JSON.stringify(data);
  }

  return text
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
}

function sleep(ms: number) {
  return new Promise((res) => setTimeout(res, ms));
}

const plannerSchema = {
  type: "object",
  properties: {
    actions: {
      type: "array",
      items: {
        type: "object",
        properties: {
          tool: { type: "string" },
          args: { type: "object" },
        },
        required: ["tool", "args"],
        additionalProperties: false,
      },
    },
  },
  required: ["actions"],
  additionalProperties: false,
} as const;

const AjvCtor = (AjvCore as any).default ?? AjvCore;
const validator = new AjvCtor({ allErrors: true, strict: false });
const validatePlanner = validator.compile(plannerSchema as any);

async function planActions(tools: Tool[], userRequest: string): Promise<PlannedAction[]> {
  if (!geminiConfig.apiKey) {
    throw new Error("Missing GEMINI_API_KEY environment variable.");
  }

  const systemMessage = `You are an MCP planning agent that has access to Jira tools. Given a user's natural-language request, select one or more tools and return only valid JSON. Do not include any additional explanatory text. Use the available tools exactly as named.`;
  const toolList = serializeToolsForPrompt(tools);
  const userMessage = `Available tools:\n${toolList}\n\nUser request: ${userRequest}\n\nReturn JSON in the form: {"actions":[{"tool":"tool_name","args":{...}}]}.`;

  const url = `https://generativelanguage.googleapis.com/v1/models/${encodeURIComponent(
    geminiConfig.model
  )}:generateContent?key=${encodeURIComponent(geminiConfig.apiKey)}`;

  const payload = {
  contents: [
    {
      parts: [
        {
          text: `${systemMessage}\n\n${userMessage}`
        }
      ]
    }
  ],
  generationConfig: {
    temperature: 0.2,
    maxOutputTokens: 512
  }
};

  // retry/backoff loop for Gemini request
  const maxAttempts = 3;
  let attempt = 0;
  let lastErr: any;
  let text = "";
  while (attempt < maxAttempts) {
    attempt += 1;
    try {
      const resp = await axios.post(url, payload, { timeout: 30000 });
      text = extractTextFromGenAIResponse(resp.data);
      break;
    } catch (err: any) {
      console.error("STATUS:", err?.response?.status);
      console.error("DATA:", JSON.stringify(err?.response?.data, null, 2));

      lastErr = err;
      const backoff = 200 * Math.pow(2, attempt - 1);
      await sleep(backoff);
    }
  }
  if (!text) {
    throw new Error(`Gemini API request failed after ${maxAttempts} attempts: ${String(lastErr)}`);
  }

  try {
    const parsed = JSON.parse(text.trim());
    const valid = validatePlanner(parsed);
    if (!valid) {
      throw new Error(`Planner JSON did not match schema: ${validator.errorsText(validatePlanner.errors, { separator: "; " })}\nRaw: ${text}`);
    }
    return parsed.actions.map((action: any) => ({
      tool: String(action.tool),
      args: typeof action.args === "object" && action.args !== null ? action.args : {},
    }));
  } catch (error) {
    throw new Error(`Unable to parse planner response as JSON: ${String(error)}\nResponse text:\n${text}`);
  }
}

async function executeActions(client: Client, tools: Tool[], actions: PlannedAction[]): Promise<string> {
  const results: string[] = [];

  for (const action of actions) {
    const tool = tools.find((candidate) => candidate.name === action.tool);
    if (!tool) {
      throw new Error(`Planner selected unknown tool: ${action.tool}`);
    }

    const validation = validateToolArgs(tool, action.args);
    if (!validation.valid) {
      throw new Error(`Invalid arguments for tool ${action.tool}: ${validation.errors}`);
    }

    const result = await client.callTool({ name: action.tool, arguments: action.args });
    const text = Array.isArray(result?.content)
      ? result.content.map((part: any) => part?.text ?? JSON.stringify(part)).join("\n")
      : JSON.stringify(result);
    results.push(`Tool: ${action.tool}\nResult:\n${text}`);
  }

  return results.join("\n\n");
}

async function main() {
  const request = process.argv.slice(2).join(" ").trim();
  if (!request) {
    console.error("Usage: node dist/agent.js \"<natural language request>\"");
    process.exit(1);
  }

  // GEMINI API key is validated inside planActions

  const transport = new StdioClientTransport({
    command: "node",
    args: ["dist/server.js"],
    env: process.env as Record<string, string>,
  });

  const client = new Client({ name: "jira-mcp-agent", version: "0.1.0" }, { capabilities: {} });
  await client.connect(transport);

  try {
    const toolList = await client.listTools();
    const tools = Array.isArray(toolList.tools) ? (toolList.tools as Tool[]) : [];
    if (tools.length === 0) {
      throw new Error("No tools discovered from the Jira MCP server.");
    }

    const actions = await planActions(tools, request);
    if (actions.length === 0) {
      throw new Error("Planner did not return any actions.");
    }

    const result = await executeActions(client, tools, actions);
    console.log(result);
  } finally {
    await transport.close();
  }
}

main().catch((error) => {
  console.error("Error:", error instanceof Error ? error.message : String(error));
  process.exit(1);
});
