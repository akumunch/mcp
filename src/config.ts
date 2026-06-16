import dotenv from "dotenv";

import { resolve } from "path";
import { fileURLToPath } from "url";
const __dirname = fileURLToPath(new URL(".", import.meta.url));
dotenv.config({ path: resolve(__dirname, "../.env") });

const requiredEnv = [
  "JIRA_BASE_URL",
  "JIRA_EMAIL",
  "ATLASSIAN_MCP_TOKEN",
  "JIRA_PROJECT_KEY"
];

for (const key of requiredEnv) {
  if (!process.env[key]) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
}

export interface JiraConfig {
  baseUrl: string;
  email: string;
  apiToken: string;
  projectKey: string;
  issueType: string;
  port: number;
}

export const jiraConfig: JiraConfig = {
  baseUrl: process.env.JIRA_BASE_URL as string,
  email: process.env.JIRA_EMAIL as string,
  apiToken: process.env.ATLASSIAN_MCP_TOKEN as string,
  projectKey: process.env.JIRA_PROJECT_KEY as string,
  issueType: process.env.JIRA_ISSUE_TYPE ?? "Task",
  port: Number(process.env.PORT ?? 4000)
};

export interface GeminiConfig {
  apiKey: string;
  model: string;
}

export const geminiConfig: GeminiConfig = {
  apiKey: process.env.GEMINI_API_KEY ?? "",
  model:
    process.env.GEMINI_MODEL ?? process.env.GEMINI_MODEL_NAME ?? "gemini-2.5-flash",
};

export interface GitHubConfig {
  personalAccessToken: string;
  repoOwner: string;
  repoName: string;
  issueLabels: string[];
  issueAssignees: string[];
}

export const githubConfig: GitHubConfig = {
  personalAccessToken: process.env.GITHUB_PERSONAL_ACCESS_TOKEN ?? "",
  repoOwner: process.env.GITHUB_REPO_OWNER ?? "",
  repoName: process.env.GITHUB_REPO_NAME ?? "",
  issueLabels: process.env.GITHUB_ISSUE_LABELS?.split(",").map((label) => label.trim()).filter(Boolean) ?? [],
  issueAssignees: process.env.GITHUB_ISSUE_ASSIGNEES?.split(",").map((assignee) => assignee.trim()).filter(Boolean) ?? [],
};
