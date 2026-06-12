    import { Client } from "@modelcontextprotocol/sdk/client/index.js";
    import { StdioClientTransport, type StdioServerParameters } from "@modelcontextprotocol/sdk/client/stdio.js";
    import { githubConfig, jiraConfig } from "./config.js";

    interface MCPTool {
    name: string;
    description?: string;
    inputSchema?: {
        type: "object";
        properties?: Record<string, { type?: string }>;
        required?: string[];
    };
    }

    async function startClient(command: string, args: string[], env: Record<string, string>): Promise<{ client: Client; transport: StdioClientTransport }> {
    const transport = new StdioClientTransport({ command, args, env });
    const client = new Client({ name: `${command} MCP client`, version: "1.0.0" }, { capabilities: {} });
    await client.connect(transport);
    return { client, transport };
    }

    function normalizeKey(key: string): string {
    return key.toLowerCase();
    }

    function findGitHubIssueTool(tools: MCPTool[]): MCPTool | undefined {
    const createIssueByName = tools.find((tool) => /create.*issue/i.test(tool.name));
    if (createIssueByName) {
        return createIssueByName;
    }

    return tools.find((tool) => /issue/i.test(tool.name) && /create|new/i.test(tool.description ?? ""));
    }

    function findJiraCreateTool(tools: MCPTool[]): MCPTool | undefined {
    return tools.find((tool) => tool.name === "create_issue");
    }

    function createGitHubArgs(tool: MCPTool, title: string, body: string): Record<string, unknown> {
    const props = tool.inputSchema?.properties ?? {};
    const keys = Object.keys(props);
    const normalized = keys.reduce<Record<string, string>>((map, key) => {
        map[normalizeKey(key)] = key;
        return map;
    }, {});

    const set = (names: string[], value: unknown) => {
        for (const name of names) {
        const key = normalized[normalizeKey(name)];
        if (key) {
            return { [key]: value };
        }
        }
        return {};
    };

    const args: Record<string, unknown> = {};
    Object.assign(args, set(["owner", "repositoryowner", "repoowner", "organization", "org"], githubConfig.repoOwner));
    Object.assign(args, set(["repo", "repository", "repositoryname", "repository_name", "repo_name", "repositoryName"], githubConfig.repoName));
    Object.assign(args, set(["title", "issue_title", "name", "summary"], title));
    Object.assign(args, set(["body", "description", "content", "text"], body));

    if (githubConfig.issueLabels.length) {
        const key = normalized["labels"] ?? normalized["label"];
        if (key) {
        args[key] = githubConfig.issueLabels;
        }
    }

    if (githubConfig.issueAssignees.length) {
        const key = normalized["assignees"];
        if (key) {
        args[key] = githubConfig.issueAssignees;
        }
    }

    return args;
    }

    function parseToolResult(result: any): any {
    const content = Array.isArray(result?.content) ? result.content : [];
    for (const item of content) {
        if (item?.type === "text" && typeof item.text === "string") {
        try {
            return JSON.parse(item.text);
        } catch {
            const trimmed = item.text.trim();
            if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
            try {
                return JSON.parse(trimmed);
            } catch {
                // fall through
            }
            }
            return item.text;
        }
        }
    }
    return result;
    }

    async function listTools(client: Client): Promise<MCPTool[]> {
    const result = await client.listTools();
    return Array.isArray(result.tools) ? result.tools as MCPTool[] : [];
    }

    async function createGitHubIssue(client: Client, title: string, body: string): Promise<any> {
    const tools = await listTools(client);
    const tool = findGitHubIssueTool(tools);
    if (!tool) {
        throw new Error("GitHub issue creation tool not found on the GitHub MCP server.");
    }

    const args = createGitHubArgs(tool, title, body);
    const result = await client.callTool({ name: tool.name, arguments: args });
    return parseToolResult(result);
    }

    async function createJiraIssue(client: Client, title: string, body: string): Promise<any> {
    const tools = await listTools(client);
    const tool = findJiraCreateTool(tools);
    if (!tool) {
        throw new Error("Jira create_issue tool not found on the Jira MCP server.");
    }

    const result = await client.callTool({
        name: tool.name,
        arguments: {
        summary: title,
        description: body,
        issueType: jiraConfig.issueType,
        },
    });
    return parseToolResult(result);
    }

    function requireGitHubConfig(): void {
    const missing: string[] = [];
    if (!githubConfig.personalAccessToken) missing.push("GITHUB_PERSONAL_ACCESS_TOKEN");
    if (!githubConfig.repoOwner) missing.push("GITHUB_REPO_OWNER");
    if (!githubConfig.repoName) missing.push("GITHUB_REPO_NAME");
    if (missing.length > 0) {
        throw new Error(`Missing required GitHub environment variables: ${missing.join(", ")}`);
    }
    }

    async function run(title: string, body: string) {
    requireGitHubConfig();

    const githubEnv = {
        ...process.env,
        GITHUB_PERSONAL_ACCESS_TOKEN: githubConfig.personalAccessToken,
    } as Record<string, string>;

    const jiraEnv = { ...process.env } as Record<string, string>;

    const githubClientInfo = await startClient("npx", ["-y", "@modelcontextprotocol/server-github"], githubEnv);
    const jiraClientInfo = await startClient("node", ["dist/server.js"], jiraEnv);

    try {
        console.log("Connected to GitHub and Jira MCP servers.");

        console.log("Creating GitHub issue...");
        const githubIssue = await createGitHubIssue(githubClientInfo.client, title, body);
        console.log("GitHub issue result:", githubIssue);

        console.log("Creating Jira issue...");
        const jiraIssue = await createJiraIssue(jiraClientInfo.client, title, body);
        console.log("Jira issue result:", jiraIssue);

        console.log("\nLinked ticket creation complete.");
        console.log("GitHub issue:", githubIssue?.html_url ?? githubIssue?.url ?? githubIssue);
        console.log("Jira issue:", jiraIssue?.key ?? jiraIssue?.id ?? jiraIssue);
    } finally {
        await githubClientInfo.transport.close();
        await jiraClientInfo.transport.close();
    }
    }

    async function main() {
    const [title, ...descriptionParts] = process.argv.slice(2);
    if (!title) {
        console.error("Usage: node dist/orchestrator.js <title> [description]");
        process.exit(1);
    }

    const body = descriptionParts.join(" ");
    await run(title, body);
    }

    main().catch((error) => {
    console.error("Error:", error instanceof Error ? error.message : String(error));
    process.exit(1);
    });
