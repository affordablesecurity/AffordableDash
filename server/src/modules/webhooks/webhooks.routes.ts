import { PaymentStatus } from "@prisma/client";
import { type Request, type Response, Router } from "express";
import Stripe from "stripe";
import { env } from "../../config/env.js";
import { prisma } from "../../db/prisma.js";
import { asyncHandler } from "../../utils/async-handler.js";
import { sendPaymentReceiptSms } from "../messaging/messaging.service.js";
import { stripe } from "../payments/stripe.service.js";

export const webhooksRouter = Router();

type SmsWebhookPayload = Record<string, unknown>;

function payloadValue(value: unknown): string {
  if (Array.isArray(value)) return payloadValue(value[0]);
  if (typeof value === "number") return String(value);
  return typeof value === "string" ? value.trim() : "";
}

function firstPayloadValue(payload: SmsWebhookPayload, keys: string[]): string {
  for (const key of keys) {
    const value = payloadValue(payload[key]);
    if (value) return value;
  }
  return "";
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
  const bodyPayload = req.body && typeof req.body === "object" && !Array.isArray(req.body) ? req.body as SmsWebhookPayload : {};
  const payload = { ...req.query, ...bodyPayload } as SmsWebhookPayload;
  const fromNumber = firstPayloadValue(payload, ["from", "from_number", "from_did", "src", "source", "callerid", "caller_id", "sender", "phone"]);
  const toNumber = firstPayloadValue(payload, ["dst", "to", "to_number", "did", "did_number", "destination", "recipient"]) || env.VOIPMS_DID || "";
  const body = firstPayloadValue(payload, ["message", "sms", "body", "text", "msg", "content"]);
  const providerRef = firstPayloadValue(payload, ["sms_id", "id", "message_id", "message_uuid", "uuid"]);

  if (!fromNumber || !body) {
    return res.status(400).json({ error: "Missing inbound SMS sender or message body" });
  }

  const credentials = await prisma.integrationCredential.findMany({
    where: { provider: "voipms", enabled: true }
  });
  const matchingCredential = credentials.find((credential) => credentialDids(credential.metadata).some((did) => samePhoneNumber(did, toNumber)));
  const locationId = matchingCredential?.locationId ?? undefined;
  const customerCandidates = await prisma.customer.findMany({
    where: locationId ? { locationId } : {},
    take: 5000
  });
  const customer = customerCandidates.find((item) => samePhoneNumber(item.phone, fromNumber) || samePhoneNumber(item.alternatePhone, fromNumber)) ?? null;
  const resolvedLocationId = locationId ?? customer?.locationId ?? (credentials.length === 1 ? credentials[0].locationId ?? undefined : undefined);

  const message = await prisma.message.create({
    data: {
      locationId: resolvedLocationId,
      customerId: customer?.id,
      direction: "INBOUND",
      fromNumber,
      toNumber,
      body,
      status: "RECEIVED",
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
