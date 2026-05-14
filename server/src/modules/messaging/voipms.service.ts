import { env } from "../../config/env.js";

export async function sendSms(to: string, message: string) {
  if (!env.VOIPMS_USERNAME || !env.VOIPMS_API_PASSWORD || !env.VOIPMS_DID) {
    throw new Error("VoIP.ms SMS is not configured");
  }

  const params = new URLSearchParams({
    api_username: env.VOIPMS_USERNAME,
    api_password: env.VOIPMS_API_PASSWORD,
    method: "sendSMS",
    did: env.VOIPMS_DID,
    dst: to,
    message
  });

  const response = await fetch(`${env.VOIPMS_BASE_URL}?${params.toString()}`);
  const data = await response.json() as { status?: string; sms?: string; [key: string]: unknown };

  if (data.status && data.status !== "success") {
    throw new Error(`VoIP.ms SMS failed: ${data.status}`);
  }

  return data;
}
