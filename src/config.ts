import dotenv from "dotenv";

dotenv.config();

const requiredEnv = [
  "JIRA_BASE_URL",
  "JIRA_EMAIL",
  "JIRA_API_TOKEN",
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
  port: number;
}

export const jiraConfig: JiraConfig = {
  baseUrl: process.env.JIRA_BASE_URL as string,
  email: process.env.JIRA_EMAIL as string,
  apiToken: process.env.JIRA_API_TOKEN as string,
  projectKey: process.env.JIRA_PROJECT_KEY as string,
  port: Number(process.env.PORT ?? 4000)
};
