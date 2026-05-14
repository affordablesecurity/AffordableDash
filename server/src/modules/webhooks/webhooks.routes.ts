import { PaymentStatus } from "@prisma/client";
import { Router } from "express";
import Stripe from "stripe";
import { z } from "zod";
import { env } from "../../config/env.js";
import { prisma } from "../../db/prisma.js";
import { asyncHandler } from "../../utils/async-handler.js";
import { stripe } from "../payments/stripe.service.js";

export const webhooksRouter = Router();

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
        await prisma.invoice.update({ where: { id: invoiceId }, data: { status: "PAID" } });
      }
    }
  }

  res.json({ received: true });
}));

webhooksRouter.post("/voipms/sms", asyncHandler(async (req, res) => {
  const input = z.object({
    from: z.string().optional(),
    dst: z.string().optional(),
    did: z.string().optional(),
    message: z.string().optional(),
    sms: z.string().optional()
  }).passthrough().parse(req.body);

  const fromNumber = input.from ?? "";
  const customer = fromNumber
    ? await prisma.customer.findFirst({ where: { OR: [{ phone: fromNumber }, { alternatePhone: fromNumber }] } })
    : null;

  await prisma.message.create({
    data: {
      customerId: customer?.id,
      direction: "INBOUND",
      fromNumber,
      toNumber: input.dst ?? input.did ?? env.VOIPMS_DID ?? "",
      body: input.message ?? "",
      providerRef: input.sms
    }
  });

  res.json({ received: true });
}));

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
