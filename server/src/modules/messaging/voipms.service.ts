import { env } from "../../config/env.js";

export type VoipmsSmsConfig = {
  username?: string;
  apiPassword?: string;
  did?: string;
  baseUrl?: string;
};

type VoipmsMessageResponse = { status?: string; sms?: string; mms?: string; [key: string]: unknown };

function attachmentMedia(value: string) {
  let rawValue = value.trim();
  try {
    const parsed = JSON.parse(rawValue) as { dataUrl?: string; url?: string };
    rawValue = parsed.dataUrl || parsed.url || rawValue;
  } catch {
    // Plain URLs and base64 payloads are accepted below.
  }

  const dataUrlMatch = /^data:[^;]+;base64,(.+)$/i.exec(rawValue);
  if (dataUrlMatch?.[1]) return dataUrlMatch[1];
  if (/^https?:\/\//i.test(rawValue)) return rawValue;
  if (/^[A-Za-z0-9+/]+={0,2}$/.test(rawValue) && rawValue.length > 200) return rawValue;
  return "";
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
    did,
    dst: to,
    message
  });

  const response = await fetch(`${baseUrl}?${params.toString()}`);
  const data = await response.json() as VoipmsMessageResponse;

  if (data.status && data.status !== "success") {
    throw new Error(`VoIP.ms SMS failed: ${data.status}`);
  }

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

  const media = attachments.map(attachmentMedia).filter(Boolean).slice(0, 3);
  if (!media.length) {
    throw new Error("No MMS-compatible attachment was provided.");
  }

  const params = new URLSearchParams({
    api_username: username,
    api_password: apiPassword,
    method: "sendMMS",
    did,
    dst: to,
    message
  });

  media.forEach((item, index) => {
    params.set(`media${index + 1}`, item);
  });

  const response = await fetch(baseUrl, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: params.toString()
  });
  const data = await response.json() as VoipmsMessageResponse;

  if (data.status && data.status !== "success") {
    throw new Error(`VoIP.ms MMS failed: ${data.status}`);
  }

  return data;
}
