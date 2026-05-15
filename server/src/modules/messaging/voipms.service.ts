import { env } from "../../config/env.js";

export type VoipmsSmsConfig = {
  username?: string;
  apiPassword?: string;
  did?: string;
  baseUrl?: string;
};

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
  const data = await response.json() as { status?: string; sms?: string; [key: string]: unknown };

  if (data.status && data.status !== "success") {
    throw new Error(`VoIP.ms SMS failed: ${data.status}`);
  }

  return data;
}
