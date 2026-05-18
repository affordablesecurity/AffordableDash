const API_URL = import.meta.env.VITE_API_URL ?? "";

export type LoginResponse = {
  token?: string;
  user?: { id: string; email: string; username: string; name: string; role: string };
  organization?: { id: string; name: string };
  location?: { id: string; name: string };
  locations?: Array<{ role: string; organization: { id: string; name: string }; location: { id: string; name: string } }>;
  mfaRequired?: boolean;
  challengeId?: string;
  method?: "email" | "sms" | "both";
  deliveryTarget?: string;
};

export function getToken() {
  return localStorage.getItem("crm_token");
}

export function setToken(token: string) {
  localStorage.setItem("crm_token", token);
}

export function clearToken() {
  localStorage.removeItem("crm_token");
}

export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

type ApiOptions = RequestInit & {
  skipAuth?: boolean;
};

export async function api<T>(path: string, options: ApiOptions = {}): Promise<T> {
  const { skipAuth, headers, ...fetchOptions } = options;
  const token = skipAuth ? null : getToken();
  const response = await fetch(`${API_URL}${path}`, {
    ...fetchOptions,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers
    }
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({ error: response.statusText }));
    const fieldErrors = body.details?.fieldErrors
      ? Object.entries(body.details.fieldErrors)
          .flatMap(([field, messages]) => Array.isArray(messages) ? messages.map((message) => `${field}: ${message}`) : [])
          .join(" ")
      : "";
    throw new ApiError(fieldErrors || body.error || "Request failed", response.status);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}

export function login(identifier: string, password: string) {
  return api<LoginResponse>("/api/auth/login", {
    skipAuth: true,
    method: "POST",
    body: JSON.stringify({ identifier, password })
  });
}

export function verifyLoginCode(challengeId: string, code: string) {
  return api<LoginResponse>("/api/auth/verify-login-code", {
    skipAuth: true,
    method: "POST",
    body: JSON.stringify({ challengeId, code })
  });
}

export function signup(input: {
  name: string;
  email: string;
  username: string;
  password: string;
  companyName: string;
  locationName: string;
  phone?: string;
  city?: string;
  state?: string;
}) {
  const username = input.username.trim().toLowerCase();
  return api<LoginResponse>("/api/auth/signup", {
    skipAuth: true,
    method: "POST",
    body: JSON.stringify({ ...input, username })
  });
}
