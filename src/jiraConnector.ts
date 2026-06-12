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
    console.error("Jira auth email:", jiraConfig.email);
    console.error("Jira base URL:", jiraConfig.baseUrl)
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
    const payload = {
      fields: {
        ...fields,
        project: { key: jiraConfig.projectKey },
        description: fields.description ? {
          type: "doc",
          version: 1,
          content: [
            {
              type: "paragraph",
              content: [
                {
                  type: "text",
                  text: fields.description}
              ]
            }
          ]
        } : undefined
      }
    };
    try {
    console.error("Jira payload:", JSON.stringify(payload, null, 2));
    const response = await this.client.post("/issue", payload);
    return response.data as JiraIssue;
    } catch (error: any) {
      console.error("Jira create error:", JSON.stringify(error?.response?.data, null, 2));
      throw error;
    }
  }

  async updateIssue(issueIdOrKey: string, fields: Partial<JiraIssueFields>): Promise<void> {
    await this.client.put(`/issue/${encodeURIComponent(issueIdOrKey)}`, { fields });
  }
}
