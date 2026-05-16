import { env } from "../../config/env.js";

export type VoipmsSmsConfig = {
  username?: string;
  apiPassword?: string;
  did?: string;
  baseUrl?: string;
  messageId?: string;
  publicBaseUrl?: string;
};

type VoipmsMessageResponse = { status?: string; sms?: string; mms?: string; [key: string]: unknown };

function xmlValue(text: string, key: string): string {
  const match = new RegExp(`<${key}[^>]*>([\\s\\S]*?)<\\/${key}>`, "i").exec(text);
  if (!match?.[1]) return "";
  return match[1].replace(/^<!\[CDATA\[([\s\S]*?)\]\]>$/i, "$1").trim();
}

function stripMarkup(text: string): string {
  return text
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/gi, "$1")
    .replace(/<[^>]+>/g, " ")
    .replace(/&quot;/g, "\"")
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

function xmlRpcValue(text: string, key: string): string {
  const memberRegex = /<member>\s*<name>([\s\S]*?)<\/name>\s*<value>([\s\S]*?)<\/value>\s*<\/member>/gi;
  let match = memberRegex.exec(text);
  while (match) {
    if (stripMarkup(match[1]).toLowerCase() === key.toLowerCase()) return stripMarkup(match[2]);
    match = memberRegex.exec(text);
  }
  return "";
}

function queryValue(text: string, key: string): string {
  const match = new RegExp(`(?:^|[?&\\s])${key}=([^&\\s<]+)`, "i").exec(text);
  if (!match?.[1]) return "";
  try {
    return decodeURIComponent(match[1]).trim();
  } catch {
    return match[1].trim();
  }
}

function parseVoipmsResponseText(text: string): VoipmsMessageResponse {
  const trimmed = text.trim();
  if (!trimmed) return {};

  try {
    return JSON.parse(trimmed) as VoipmsMessageResponse;
  } catch {
    // VoIP.ms can return XML/plain text for some API errors.
  }

  const status = xmlValue(trimmed, "status") || xmlRpcValue(trimmed, "status") || queryValue(trimmed, "status");
  const error = xmlValue(trimmed, "error")
    || xmlValue(trimmed, "errors")
    || xmlValue(trimmed, "message")
    || xmlValue(trimmed, "faultString")
    || xmlRpcValue(trimmed, "error")
    || xmlRpcValue(trimmed, "errors")
    || xmlRpcValue(trimmed, "message")
    || xmlRpcValue(trimmed, "faultString")
    || queryValue(trimmed, "error")
    || queryValue(trimmed, "message");
  const sms = xmlValue(trimmed, "sms") || xmlValue(trimmed, "sms_id") || xmlRpcValue(trimmed, "sms") || xmlRpcValue(trimmed, "sms_id") || queryValue(trimmed, "sms");
  const mms = xmlValue(trimmed, "mms") || xmlValue(trimmed, "mms_id") || xmlRpcValue(trimmed, "mms") || xmlRpcValue(trimmed, "mms_id") || queryValue(trimmed, "mms");

  if (status || error || sms || mms) {
    return { status, error, sms, mms, raw: trimmed.slice(0, 500) };
  }

  if (/success/i.test(trimmed)) return { status: "success", raw: trimmed.slice(0, 500) };

  return {
    status: "error",
    error: trimmed.startsWith("<") ? stripMarkup(trimmed).slice(0, 240) || "VoIP.ms returned XML without a readable status." : trimmed.slice(0, 200),
    raw: trimmed.slice(0, 500)
  };
}

async function readVoipmsResponse(response: Awaited<ReturnType<typeof fetch>>): Promise<VoipmsMessageResponse> {
  const text = await response.text();
  const data = parseVoipmsResponseText(text);
  if (!response.ok) {
    const detail = String(data.error ?? data.message ?? text.slice(0, 200) ?? "Request failed");
    throw new Error(`VoIP.ms request failed (${response.status}): ${detail}`);
  }
  return data;
}

function assertVoipmsSuccess(data: VoipmsMessageResponse, label: "SMS" | "MMS") {
  const status = typeof data.status === "string" ? data.status.toLowerCase() : "";
  if (status && status !== "success") {
    const detail = String(data.error ?? data.message ?? data.status);
    throw new Error(`VoIP.ms ${label} failed: ${detail}`);
  }
}

function mediaUrlForMessage(messageId: string, index: number, publicBaseUrl?: string) {
  const baseUrl = (publicBaseUrl || env.PUBLIC_BASE_URL).replace(/\/+$/, "");
  return `${baseUrl}/api/webhooks/voipms/media/${encodeURIComponent(messageId)}/${index}`;
}

function attachmentMedia(value: string, index: number, config: VoipmsSmsConfig = {}) {
  let rawValue = value.trim();
  try {
    const parsed = JSON.parse(rawValue) as { dataUrl?: string; url?: string };
    rawValue = parsed.dataUrl || parsed.url || rawValue;
  } catch {
    // Plain URLs and base64 payloads are accepted below.
  }

  if (/^data:[^;]+;base64,[A-Za-z0-9+/]+={0,2}$/i.test(rawValue)) {
    return config.messageId ? mediaUrlForMessage(config.messageId, index, config.publicBaseUrl) : "";
  }
  if (/^https?:\/\//i.test(rawValue)) return rawValue;
  if (/^[A-Za-z0-9+/]+={0,2}$/.test(rawValue) && rawValue.length > 200) {
    return config.messageId ? mediaUrlForMessage(config.messageId, index, config.publicBaseUrl) : "";
  }
  return "";
}

function voipmsPhoneNumber(value: string) {
  const digits = value.replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("1")) return digits.slice(1);
  return digits || value.trim();
}

export async function sendSms(to: string, message: string, config: VoipmsSmsConfig = {}) {
  const username = config.username || env.VOIPMS_USERNAME;
  const apiPassword = config.apiPassword || env.VOIPMS_API_PASSWORD;
  const did = config.did || env.VOIPMS_DID;
  const baseUrl = config.baseUrl || env.VOIPMS_BASE_URL;

  if (!username || !apiPassword || !did) {
    throw new Error("VoIP.ms SMS is not configured");
  }

  const params = new URLSearchParams({
    api_username: username,
    api_password: apiPassword,
    method: "sendSMS",
    did: voipmsPhoneNumber(did),
    dst: voipmsPhoneNumber(to),
    message,
    content_type: "json"
  });

  const response = await fetch(`${baseUrl}?${params.toString()}`);
  const data = await readVoipmsResponse(response);
  assertVoipmsSuccess(data, "SMS");

  return data;
}

export async function sendMms(to: string, message: string, attachments: string[], config: VoipmsSmsConfig = {}) {
  const username = config.username || env.VOIPMS_USERNAME;
  const apiPassword = config.apiPassword || env.VOIPMS_API_PASSWORD;
  const did = config.did || env.VOIPMS_DID;
  const baseUrl = config.baseUrl || env.VOIPMS_BASE_URL;

  if (!username || !apiPassword || !did) {
    throw new Error("VoIP.ms MMS is not configured");
  }

  const media = attachments.map((attachment, index) => attachmentMedia(attachment, index, config)).filter(Boolean).slice(0, 3);
  if (!media.length) {
    throw new Error("No MMS-compatible attachment was provided.");
  }

  const params = new URLSearchParams({
    api_username: username,
    api_password: apiPassword,
    method: "sendMMS",
    did: voipmsPhoneNumber(did),
    dst: voipmsPhoneNumber(to),
    message,
    content_type: "json"
  });

  media.forEach((item, index) => {
    params.set(`media${index + 1}`, item);
  });

  const response = await fetch(`${baseUrl}?${params.toString()}`);
  const data = await readVoipmsResponse(response);
  assertVoipmsSuccess(data, "MMS");

  return data;
}
