const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:4100";

export type LoginResponse = {
  token: string;
  user: { id: string; email: string; username: string; name: string; role: string };
  organization?: { id: string; name: string };
  location?: { id: string; name: string };
  locations?: Array<{ role: string; organization: { id: string; name: string }; location: { id: string; name: string } }>;
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

export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers
    }
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({ error: response.statusText }));
    throw new Error(body.error ?? "Request failed");
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}

export function login(identifier: string, password: string) {
  return api<LoginResponse>("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ identifier, password })
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
  return api<LoginResponse>("/api/auth/signup", {
    method: "POST",
    body: JSON.stringify(input)
  });
}
