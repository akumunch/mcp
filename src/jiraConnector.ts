import axios, { AxiosInstance } from "axios";
import { jiraConfig } from "./config.js";

export interface JiraIssueFields {
  summary: string;
  description?: string;
  issuetype: { name: string };
  project: { key: string };
  [key: string]: unknown;
}

export interface JiraIssue {
  id: string;
  key: string;
  fields: JiraIssueFields;
}

export interface JiraSearchResult {
  total: number;
  issues: JiraIssue[];
}

export class JiraConnector {
  private client: AxiosInstance;

  constructor() {
    const auth = Buffer.from(`${jiraConfig.email}:${jiraConfig.apiToken}`).toString("base64");
    this.client = axios.create({
      baseURL: `${jiraConfig.baseUrl}/rest/api/3`,
      headers: {
        Authorization: `Basic ${auth}`,
        Accept: "application/json",
        "Content-Type": "application/json"
      }
    });
  }

  async searchIssues(jql = `project = ${jiraConfig.projectKey}`, maxResults = 50): Promise<JiraSearchResult> {
    const response = await this.client.post("/search/jql", {
      jql,
      maxResults,
      fields: ["summary", "description", "issuetype", "project"]
    });
    return response.data as JiraSearchResult;
  }

  async getIssue(issueIdOrKey: string): Promise<JiraIssue> {
    const response = await this.client.get(`/issue/${encodeURIComponent(issueIdOrKey)}`);
    return response.data as JiraIssue;
  }

  async createIssue(fields: JiraIssueFields): Promise<JiraIssue> {
    const payload = { fields: { ...fields, project: { key: jiraConfig.projectKey } } };
    const response = await this.client.post("/issue", payload);
    return response.data as JiraIssue;
  }

  async updateIssue(issueIdOrKey: string, fields: Partial<JiraIssueFields>): Promise<void> {
    await this.client.put(`/issue/${encodeURIComponent(issueIdOrKey)}`, { fields });
  }
}
