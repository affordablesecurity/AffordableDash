import { InvoiceStatus, PaymentStatus } from "@prisma/client";
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../db/prisma.js";
import { activeLocationId } from "../../middleware/auth.js";
import { asyncHandler } from "../../utils/async-handler.js";
import { sendPaymentReceiptEmail, sendPaymentReceiptSms } from "../messaging/messaging.service.js";
import { createInvoiceCheckoutSession, createInvoicePaymentIntent } from "./stripe.service.js";

export const paymentsRouter = Router();

const invoiceInclude = {
  customer: { include: { addresses: true } },
  job: { include: { address: true, technician: true, lineItems: true } },
  items: true,
  payments: true
} as const;

const manualPaymentSchema = z.object({
  amount: z.number().int().positive(),
  method: z.enum(["cash", "check", "other"]),
  note: z.string().trim().max(500).optional(),
  emailReceipt: z.string().trim().email().optional().or(z.literal("")),
  otherType: z.string().trim().max(100).optional(),
  notifyCustomer: z.boolean().default(false)
});

const checkoutSessionSchema = z.object({
  amount: z.number().int().positive().optional(),
  tipAmount: z.number().int().min(0).optional(),
  customerEmail: z.string().trim().email().optional().or(z.literal(""))
});

paymentsRouter.post("/invoices/:invoiceId/payment-intent", asyncHandler(async (req, res) => {
  const invoiceId = String(req.params.invoiceId);
  const invoice = await prisma.invoice.findFirst({ where: { id: invoiceId, locationId: activeLocationId(req) } });
  if (!invoice) return res.status(404).json({ error: "Invoice not found" });
  if (invoice.total <= 0) return res.status(422).json({ error: "Invoice total must be greater than zero" });

  const intent = await createInvoicePaymentIntent(invoice);
  await prisma.invoice.update({
    where: { id: invoice.id },
    data: { stripePaymentIntentId: intent.id }
  });

  res.json({ clientSecret: intent.client_secret, paymentIntentId: intent.id });
}));

paymentsRouter.post("/invoices/:invoiceId/checkout-session", asyncHandler(async (req, res) => {
  const invoiceId = String(req.params.invoiceId);
  const invoice = await prisma.invoice.findFirst({
    where: { id: invoiceId, locationId: activeLocationId(req) },
    include: { customer: true, job: true, items: true }
  });
  if (!invoice) return res.status(404).json({ error: "Invoice not found" });
  if (invoice.total <= 0) return res.status(422).json({ error: "Invoice total must be greater than zero" });

  const input = checkoutSessionSchema.parse(req.body ?? {});
  const origin = req.header("origin") || `${req.protocol}://${req.get("host")}`;
  const session = await createInvoiceCheckoutSession(invoice, origin, input);
  res.json({ url: session.url, checkoutSessionId: session.id });
}));

paymentsRouter.post("/invoices/:invoiceId/manual", asyncHandler(async (req, res) => {
  const invoiceId = String(req.params.invoiceId);
  const locationId = activeLocationId(req);
  const invoice = await prisma.invoice.findFirst({
    where: { id: invoiceId, locationId },
    include: { payments: true }
  });
  if (!invoice) return res.status(404).json({ error: "Invoice not found" });

  const input = manualPaymentSchema.parse(req.body);
  const providerRef = [
    input.otherType,
    input.note
  ].filter(Boolean).join(" / ") || input.method;
  const payment = await prisma.payment.create({
    data: {
      invoiceId: invoice.id,
      amount: input.amount,
      status: PaymentStatus.SUCCEEDED,
      provider: input.method,
      providerRef,
      paidAt: new Date()
    }
  });

  const paidTotal = await prisma.payment.aggregate({
    where: { invoiceId: invoice.id, status: PaymentStatus.SUCCEEDED },
    _sum: { amount: true }
  });
  const updatedInvoice = await prisma.invoice.update({
    where: { id: invoice.id },
    data: {
      status: (paidTotal._sum.amount ?? 0) >= invoice.total ? InvoiceStatus.PAID : invoice.status
    },
    include: invoiceInclude
  });
  if (input.notifyCustomer && updatedInvoice.status === InvoiceStatus.PAID && invoice.status !== InvoiceStatus.PAID) {
    await Promise.all([
      sendPaymentReceiptSms(locationId, updatedInvoice.id, input.amount),
      input.emailReceipt ? sendPaymentReceiptEmail(locationId, updatedInvoice.id, input.emailReceipt, input.amount) : null
    ]);
  }

  res.status(201).json({ payment, invoice: updatedInvoice });
}));
