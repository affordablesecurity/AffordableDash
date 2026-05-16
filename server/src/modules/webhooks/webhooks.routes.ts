import { PaymentStatus, type Customer } from "@prisma/client";
import { type Request, type Response, Router } from "express";
import Stripe from "stripe";
import { env } from "../../config/env.js";
import { prisma } from "../../db/prisma.js";
import { asyncHandler } from "../../utils/async-handler.js";
import { sendPaymentReceiptSms } from "../messaging/messaging.service.js";
import { stripe } from "../payments/stripe.service.js";

export const webhooksRouter = Router();

type SmsWebhookPayload = Record<string, unknown>;

function objectPayload(value: unknown): SmsWebhookPayload {
  return value && typeof value === "object" && !Array.isArray(value) ? value as SmsWebhookPayload : {};
}

function payloadValue(value: unknown): string {
  if (Array.isArray(value)) return payloadValue(value[0]);
  if (typeof value === "number") return String(value);
  return typeof value === "string" ? value.trim() : "";
}

function nestedPayloadValue(value: unknown, keys: string[]): string {
  const directValue = payloadValue(value);
  if (directValue) return directValue;
  const payload = objectPayload(value);
  if (!Object.keys(payload).length) return "";
  return firstPayloadValue(payload, keys);
}

function firstPayloadValue(payload: SmsWebhookPayload, keys: string[]): string {
  const normalizedPayload = new Map(Object.entries(payload).map(([key, value]) => [key.toLowerCase(), value]));
  const nestedKeys = ["phone_number", "phoneNumber", "number", "value", "id", "url", "text", "body", "message"];

  for (const key of keys) {
    const candidate = payload[key] ?? normalizedPayload.get(key.toLowerCase());
    const value = payloadValue(candidate) || nestedPayloadValue(candidate, nestedKeys);
    if (value) return value;
  }
  return "";
}

function firstPayloadValueFrom(payloads: SmsWebhookPayload[], keys: string[]): string {
  for (const payload of payloads) {
    const value = firstPayloadValue(payload, keys);
    if (value) return value;
  }
  return "";
}

function hasPayloadKey(payload: SmsWebhookPayload, keys: string[]): boolean {
  const normalizedPayload = new Set(Object.keys(payload).map((key) => key.toLowerCase()));
  return keys.some((key) => normalizedPayload.has(key.toLowerCase()));
}

function hasPayloadKeyIn(payloads: SmsWebhookPayload[], keys: string[]): boolean {
  return payloads.some((payload) => hasPayloadKey(payload, keys));
}

function phoneDigits(value?: string | null): string {
  const digits = (value ?? "").replace(/\D/g, "");
  return digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits;
}

function samePhoneNumber(left?: string | null, right?: string | null): boolean {
  const leftDigits = phoneDigits(left);
  const rightDigits = phoneDigits(right);
  return Boolean(leftDigits && rightDigits && leftDigits === rightDigits);
}

function credentialDids(metadata: unknown): string[] {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return [];
  const values = metadata as { defaultDid?: unknown; availableDids?: unknown };
  const defaultDid = payloadValue(values.defaultDid);
  const availableDids = Array.isArray(values.availableDids)
    ? values.availableDids.map(payloadValue).filter(Boolean)
    : [];
  return [defaultDid, ...availableDids].filter(Boolean);
}

function customerPhoneNumbers(customer: Pick<Customer, "phone" | "alternatePhone" | "additionalPhones">): string[] {
  const phones = [customer.phone, customer.alternatePhone].filter(Boolean) as string[];
  const additionalPhones = customer.additionalPhones;

  if (Array.isArray(additionalPhones)) {
    for (const phone of additionalPhones) {
      if (typeof phone === "string") {
        phones.push(phone);
      } else if (phone && typeof phone === "object" && !Array.isArray(phone)) {
        const values = phone as Record<string, unknown>;
        phones.push(payloadValue(values.number) || payloadValue(values.phone) || payloadValue(values.value));
      }
    }
  }

  return phones.filter(Boolean);
}

function attachmentNameFromUrl(url: string, fallback: string): string {
  try {
    const parsed = new URL(url);
    const name = parsed.pathname.split("/").filter(Boolean).pop();
    return name || fallback;
  } catch {
    return fallback;
  }
}

function collectAttachment(value: unknown, attachments: string[], fallbackIndex = attachments.length + 1) {
  if (!value) return;

  if (Array.isArray(value)) {
    value.forEach((item, index) => collectAttachment(item, attachments, fallbackIndex + index));
    return;
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return;
    if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
      try {
        collectAttachment(JSON.parse(trimmed), attachments, fallbackIndex);
        return;
      } catch {
        // Fall through and treat it as a plain URL/string.
      }
    }
    for (const url of trimmed.split(",").map((item) => item.trim()).filter(Boolean)) {
      attachments.push(JSON.stringify({
        name: attachmentNameFromUrl(url, `MMS attachment ${attachments.length + 1}`),
        dataUrl: url,
        size: 0
      }));
    }
    return;
  }

  if (typeof value === "object") {
    const item = value as Record<string, unknown>;
    const url = payloadValue(item.url)
      || payloadValue(item.href)
      || payloadValue(item.link)
      || payloadValue(item.media_url)
      || payloadValue(item.mediaUrl)
      || payloadValue(item.content_url)
      || payloadValue(item.contentUrl);
    if (!url) return;
    attachments.push(JSON.stringify({
      name: payloadValue(item.name) || payloadValue(item.filename) || attachmentNameFromUrl(url, `MMS attachment ${fallbackIndex}`),
      type: payloadValue(item.type) || payloadValue(item.content_type) || payloadValue(item.contentType) || undefined,
      dataUrl: url,
      size: 0
    }));
  }
}

function payloadAttachments(payload: SmsWebhookPayload): string[] {
  const normalizedPayload = new Map(Object.entries(payload).map(([key, value]) => [key.toLowerCase(), value]));
  const keys = [
    "media",
    "media_url",
    "mediaUrl",
    "media_urls",
    "mediaUrls",
    "mms",
    "mms_url",
    "attachment",
    "attachment_url",
    "attachments",
    "file",
    "files",
    "file_url",
    "image",
    "images",
    "image_url",
    "imageUrl",
    "picture",
    "pictures",
    "urls",
    "url"
  ];
  for (const prefix of ["media", "media_url", "mms", "mms_url", "attachment", "attachment_url", "file", "file_url", "image", "image_url"]) {
    for (let index = 1; index <= 5; index += 1) {
      keys.push(`${prefix}${index}`, `${prefix}_${index}`);
    }
  }
  const attachments: string[] = [];
  for (const key of keys) {
    collectAttachment(payload[key] ?? normalizedPayload.get(key.toLowerCase()), attachments);
  }
  return [...new Set(attachments)];
}

function payloadLooksLikeMms(payload: SmsWebhookPayload): boolean {
  if (payloadAttachments(payload).length) return true;
  if (hasPayloadKey(payload, [
    "mms",
    "mms_url",
    "mmsUrl",
    "media",
    "media_url",
    "mediaUrl",
    "attachment",
    "attachment_url",
    "attachmentUrl",
    "image",
    "image_url",
    "imageUrl",
    "picture",
    "pictures",
    "file",
    "files",
    "file_url",
    "fileUrl",
    "urls"
  ])) return true;
  const type = firstPayloadValue(payload, ["type", "message_type", "messageType", "sms_type", "smsType", "channel"]);
  return type.toLowerCase().includes("mms");
}

function payloadsLookLikeMms(payloads: SmsWebhookPayload[]): boolean {
  return payloads.some(payloadLooksLikeMms);
}

function voipmsPayloads(bodyPayload: SmsWebhookPayload): SmsWebhookPayload[] {
  const seen = new Set<unknown>();
  const collect = (value: unknown, depth = 0): SmsWebhookPayload[] => {
    if (!value || typeof value !== "object" || seen.has(value) || depth > 6) return [];
    seen.add(value);
    if (Array.isArray(value)) return value.flatMap((item) => collect(item, depth + 1));
    const payload = value as SmsWebhookPayload;
    return [
      payload,
      ...Object.values(payload).flatMap((item) => collect(item, depth + 1))
    ];
  };
  return collect(bodyPayload).filter((payload) => Object.keys(payload).length);
}

function safeWebhookPayload(value: unknown) {
  try {
    return JSON.parse(JSON.stringify(value, (key, item) => {
      if (/password|secret|token|authorization/i.test(key)) return "[redacted]";
      return item;
    }));
  } catch {
    return "[unserializable payload]";
  }
}

function payloadKeySummary(payloads: SmsWebhookPayload[]) {
  return payloads
    .map((payload) => Object.keys(payload).sort())
    .filter((keys) => keys.length)
    .slice(0, 12);
}

function attachmentData(attachment: string) {
  try {
    const parsed = JSON.parse(attachment) as { dataUrl?: string; url?: string; type?: string; name?: string };
    return {
      name: payloadValue(parsed.name),
      type: payloadValue(parsed.type),
      url: payloadValue(parsed.dataUrl) || payloadValue(parsed.url)
    };
  } catch {
    return { name: "", type: "", url: attachment.trim() };
  }
}

webhooksRouter.get("/voipms/media/:messageId/:index", asyncHandler(async (req, res) => {
  const messageId = payloadValue(req.params.messageId);
  const index = Number(req.params.index);
  if (!messageId || !Number.isInteger(index) || index < 0 || index > 4) return res.status(404).send("Not found");

  const message = await prisma.message.findUnique({
    where: { id: messageId },
    select: { attachments: true }
  });
  const attachment = message?.attachments[index];
  if (!attachment) return res.status(404).send("Not found");

  const media = attachmentData(attachment);
  if (/^https?:\/\//i.test(media.url)) return res.redirect(media.url);

  const match = /^data:([^;]+);base64,([A-Za-z0-9+/]+={0,2})$/i.exec(media.url);
  if (!match) return res.status(404).send("Not found");

  res.setHeader("content-type", media.type || match[1]);
  res.setHeader("cache-control", "public, max-age=86400");
  res.send(Buffer.from(match[2], "base64"));
}));

webhooksRouter.post("/stripe", asyncHandler(async (req, res) => {
  if (!stripe || !env.STRIPE_WEBHOOK_SECRET) {
    return res.status(400).json({ error: "Stripe webhook is not configured" });
  }

  const signature = req.header("stripe-signature");
  if (!signature) return res.status(400).json({ error: "Missing Stripe signature" });

  const event = stripe.webhooks.constructEvent(req.body, signature, env.STRIPE_WEBHOOK_SECRET);

  if (event.type === "payment_intent.succeeded" || event.type === "payment_intent.payment_failed") {
    const intent = event.data.object as Stripe.PaymentIntent;
    const invoiceId = intent.metadata.invoiceId;
    const status: PaymentStatus = event.type === "payment_intent.succeeded" ? "SUCCEEDED" : "FAILED";

    if (invoiceId) {
      await prisma.payment.upsert({
        where: { id: intent.id },
        update: {
          status,
          amount: intent.amount,
          paidAt: status === "SUCCEEDED" ? new Date() : null
        },
        create: {
          id: intent.id,
          invoiceId,
          amount: intent.amount,
          status,
          provider: "stripe",
          providerRef: intent.id,
          paidAt: status === "SUCCEEDED" ? new Date() : null
        }
      });

      if (status === "SUCCEEDED") {
        const paidInvoice = await prisma.invoice.update({
          where: { id: invoiceId },
          data: { status: "PAID" },
          select: { id: true, locationId: true }
        });
        await sendPaymentReceiptSms(paidInvoice.locationId, paidInvoice.id, intent.amount);
      }
    }
  }

  res.json({ received: true });
}));

async function receiveVoipmsSms(req: Request, res: Response) {
  const queryPayload = objectPayload(req.query);
  const bodyPayload = objectPayload(req.body);
  const payloads = [queryPayload, ...voipmsPayloads(bodyPayload)];
  const fromNumber = firstPayloadValueFrom(payloads, [
    "from",
    "from_number",
    "fromNumber",
    "from_did",
    "fromDid",
    "src",
    "source",
    "callerid",
    "caller_id",
    "callerId",
    "sender",
    "sender_number",
    "senderNumber",
    "phone",
    "contact",
    "msisdn",
    "ani",
    "origination",
    "originator"
  ]);
  const toNumber = firstPayloadValueFrom(payloads, [
    "dst",
    "destination",
    "destination_number",
    "destinationNumber",
    "to",
    "to_number",
    "toNumber",
    "did",
    "did_number",
    "didNumber",
    "destination",
    "recipient",
    "recipient_number",
    "recipientNumber",
    "dst_number",
    "local_number",
    "localNumber",
    "dnis"
  ]) || env.VOIPMS_DID || "";
  const attachments = [...new Set(payloads.flatMap(payloadAttachments))];
  const inboundBody = firstPayloadValueFrom(payloads, [
    "message",
    "sms",
    "body",
    "text",
    "msg",
    "content",
    "message_body",
    "messageBody",
    "message_text",
    "messageText",
    "mms_message",
    "mmsMessage",
    "subject",
    "caption"
  ]);
  const emptyMessageFieldWasProvided = payloads.some((payload) => hasPayloadKey(payload, ["message"]) && !payloadValue(payload.message));
  const body = inboundBody
    || (attachments.length ? "MMS attachment" : "")
    || (payloadsLookLikeMms(payloads) ? "MMS received. VoIP.ms did not include media in this callback." : "")
    || (emptyMessageFieldWasProvided ? "Message received with no text. If this was an MMS, configure the VoIP.ms SMS/MMS Webhook URL as POST JSON so media URLs are included." : "");
  const providerRef = firstPayloadValueFrom(payloads, ["sms_id", "smsId", "id", "message_id", "messageId", "message_uuid", "uuid", "reference"]);

  if (!fromNumber || !body) {
    console.warn("VoIP.ms inbound SMS webhook did not include a sender or message body", {
      query: req.query,
      body: safeWebhookPayload(bodyPayload),
      payloadKeys: payloadKeySummary(payloads)
    });
    return res.type("text/plain").send("ok");
  }

  const credentials = await prisma.integrationCredential.findMany({
    where: { provider: "voipms", enabled: true },
    include: { location: true }
  });
  const matchingCredential = credentials.find((credential) => {
    const dids = [...credentialDids(credential.metadata), credential.location?.phone].filter(Boolean) as string[];
    return dids.some((did) => samePhoneNumber(did, toNumber));
  });
  const locationId = matchingCredential?.locationId ?? undefined;
  const customerCandidates = await prisma.customer.findMany({
    where: locationId ? { locationId } : {},
    take: 5000
  });
  const customer = customerCandidates.find((item) => customerPhoneNumbers(item).some((phone) => samePhoneNumber(phone, fromNumber))) ?? null;
  const resolvedLocationId = locationId ?? customer?.locationId ?? (credentials.length === 1 ? credentials[0].locationId ?? undefined : undefined);

  if (!resolvedLocationId) {
    console.warn("VoIP.ms inbound SMS webhook could not resolve a CRM location", {
      fromNumber,
      toNumber,
      providerRef
    });
  }

  const message = await prisma.message.create({
    data: {
      locationId: resolvedLocationId,
      customerId: customer?.id,
      direction: "INBOUND",
      fromNumber,
      toNumber,
      body,
      channel: attachments.length ? "mms" : "sms",
      status: "RECEIVED",
      attachments,
      providerRef
    }
  });

  void message;
  res.type("text/plain").send("ok");
}

webhooksRouter.get("/voipms/sms", asyncHandler(receiveVoipmsSms));
webhooksRouter.post("/voipms/sms", asyncHandler(receiveVoipmsSms));

webhooksRouter.post("/housecall-pro", asyncHandler(async (req, res) => {
  if (env.HOUSECALL_PRO_WEBHOOK_SECRET) {
    const signature = req.header("x-housecallpro-signature") ?? req.header("x-webhook-secret");
    if (signature !== env.HOUSECALL_PRO_WEBHOOK_SECRET) {
      return res.status(401).json({ error: "Invalid webhook signature" });
    }
  }

  await prisma.integrationCredential.create({
    data: {
      provider: "housecall-pro:webhook-event",
      metadata: req.body,
      enabled: true
    }
  });

  res.json({ received: true });
}));
