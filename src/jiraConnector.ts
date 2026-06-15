import axios, { AxiosInstance } from "axios";
import { jiraConfig } from "./config.js";

export interface JiraIssueFields {
  summary: string;
  description?: string;
  issuetype: { name: string };
  project: { key: string };
  priority?: { name: string };
  labels?: string[];
  assignee?: { name: string };
  customfield_sprint?: string;
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

  async searchIssues(query: string, jql?: string, maxResults = 50): Promise<JiraSearchResult> {
    const effectiveJql = jql || this.buildJqlFromNaturalLanguage(query);
    const response = await this.client.post("/search/jql", {
      jql: effectiveJql,
      maxResults,
      fields: ["summary", "description", "issuetype", "project", "status", "priority", "labels", "assignee"],
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

  async updateIssue(issueIdOrKey: string, fields: Partial<JiraIssueFields>, comment?: string, status?: string): Promise<void> {
    const issueKey = encodeURIComponent(issueIdOrKey);
    if (Object.keys(fields).length > 0) {
      await this.client.put(`/issue/${issueKey}`, { fields });
    }
    if (status) {
      await this.transitionIssue(issueIdOrKey, status);
    }
    if (comment) {
      await this.client.post(`/issue/${issueKey}/comment`, { body: comment });
    }
  }

  private async transitionIssue(issueIdOrKey: string, statusName: string): Promise<void> {
    const response = await this.client.get(`/issue/${encodeURIComponent(issueIdOrKey)}/transitions`);
    const transitions = response.data?.transitions ?? [];
    const transition = transitions.find((t: any) => String(t.name).toLowerCase() === statusName.toLowerCase());
    if (!transition) {
      throw new Error(`Transition '${statusName}' not available for issue ${issueIdOrKey}.`);
    }
    await this.client.post(`/issue/${encodeURIComponent(issueIdOrKey)}/transitions`, {
      transition: { id: transition.id },
    });
  }

  private buildJqlFromNaturalLanguage(query: string): string {
    const trimmed = query?.trim();
    if (!trimmed) {
      return `project = ${jiraConfig.projectKey}`;
    }

    const isLikelyJql = /\b(project|status|labels|sprint|assignee|priority|text|summary|description|AND|OR|NOT)\b/i.test(trimmed) && /[=~<>]/.test(trimmed);
    if (isLikelyJql) {
      return trimmed;
    }

    const escaped = trimmed.replace(/["\\]/g, "\\$&");
    return `project = ${jiraConfig.projectKey} AND text ~ "${escaped}"`;
  }
}
