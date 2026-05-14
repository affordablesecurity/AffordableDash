import { env } from "../../config/env.js";

type RequestOptions = {
  method?: string;
  body?: unknown;
};

export class HousecallProClient {
  constructor(
    private readonly baseUrl = env.HOUSECALL_PRO_BASE_URL,
    private readonly apiKey = env.HOUSECALL_PRO_API_KEY
  ) {}

  private async request<T>(path: string, options: RequestOptions = {}): Promise<T> {
    if (!this.apiKey) {
      throw new Error("Housecall Pro API key is not configured");
    }

    const response = await fetch(`${this.baseUrl}${path}`, {
      method: options.method ?? "GET",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        Authorization: `Token ${this.apiKey}`
      },
      body: options.body ? JSON.stringify(options.body) : undefined
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Housecall Pro ${response.status}: ${text}`);
    }

    return response.json() as Promise<T>;
  }

  getCompany() {
    return this.request("/company");
  }

  getCustomers() {
    return this.request("/customers");
  }

  getJobs() {
    return this.request("/jobs");
  }

  getEmployees() {
    return this.request("/employees");
  }

  getInvoices() {
    return this.request("/invoices");
  }

  addJobNote(jobId: string, content: string) {
    return this.request(`/jobs/${jobId}/notes`, { method: "POST", body: { content } });
  }

  addJobLineItem(jobId: string, lineItem: unknown) {
    return this.request(`/jobs/${jobId}/line_items`, { method: "POST", body: lineItem });
  }
}

export const housecallPro = new HousecallProClient();
