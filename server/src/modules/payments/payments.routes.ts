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

const paymentSummaryQuerySchema = z.object({
  range: z.enum(["today", "week", "month", "custom"]).default("month"),
  from: z.string().trim().optional(),
  to: z.string().trim().optional()
});

const dayMs = 24 * 60 * 60 * 1000;

function startOfDay(date: Date) {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

function endOfDay(date: Date) {
  const next = new Date(date);
  next.setHours(23, 59, 59, 999);
  return next;
}

function parseDateInput(value?: string) {
  if (!value) return null;
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function summaryDateRange(input: z.infer<typeof paymentSummaryQuerySchema>) {
  const now = new Date();
  if (input.range === "custom") {
    const from = parseDateInput(input.from) ?? now;
    const to = parseDateInput(input.to) ?? from;
    return { from: startOfDay(from), to: endOfDay(to) };
  }
  if (input.range === "today") {
    return { from: startOfDay(now), to: endOfDay(now) };
  }
  if (input.range === "week") {
    const from = startOfDay(now);
    from.setDate(now.getDate() - now.getDay());
    return { from, to: endOfDay(now) };
  }
  const from = startOfDay(new Date(now.getFullYear(), now.getMonth(), 1));
  return { from, to: endOfDay(now) };
}

function estimatedStripeFee(amount: number) {
  return amount > 0 ? Math.round(amount * 0.029) + 30 : 0;
}

function isCardProvider(provider: string) {
  return ["stripe", "credit", "card", "credit_card"].includes(provider.toLowerCase());
}

function payoutDateFor(paidAt: Date) {
  return startOfDay(new Date(paidAt.getTime() + 2 * dayMs));
}

function dateKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

paymentsRouter.get("/summary", asyncHandler(async (req, res) => {
  const locationId = activeLocationId(req);
  const input = paymentSummaryQuerySchema.parse(req.query);
  const { from, to } = summaryDateRange(input);
  const now = new Date();
  const payments = await prisma.payment.findMany({
    where: {
      status: PaymentStatus.SUCCEEDED,
      OR: [
        { paidAt: { gte: from, lte: to } },
        { paidAt: null, createdAt: { gte: from, lte: to } }
      ],
      invoice: { locationId }
    },
    include: {
      invoice: {
        include: {
          customer: true,
          job: true
        }
      }
    },
    orderBy: [{ paidAt: "desc" }, { createdAt: "desc" }]
  });

  const methodTotals = {
    card: { label: "Credit cards", count: 0, gross: 0, fees: 0, net: 0 },
    cash: { label: "Cash", count: 0, gross: 0, fees: 0, net: 0 },
    check: { label: "Checks", count: 0, gross: 0, fees: 0, net: 0 },
    other: { label: "Other", count: 0, gross: 0, fees: 0, net: 0 }
  };
  const pendingTransactions: Array<Record<string, unknown>> = [];
  const payoutGroups = new Map<string, {
    id: string;
    depositDate: string;
    totalAmount: number;
    gross: number;
    fees: number;
    status: "pending" | "paid";
    transactions: Array<Record<string, unknown>>;
  }>();

  for (const payment of payments) {
    const provider = payment.provider.toLowerCase();
    const paidAt = payment.paidAt ?? payment.createdAt;
    const customer = payment.invoice.customer;
    const transaction = {
      id: payment.id,
      date: paidAt.toISOString(),
      paymentMethod: provider,
      jobNumber: payment.invoice.job?.jobNumber ?? null,
      invoiceNumber: payment.invoice.invoiceNumber,
      customer: [customer.firstName, customer.lastName].filter(Boolean).join(" ") || customer.companyName || "Customer",
      amount: payment.amount,
      gross: payment.amount,
      fees: isCardProvider(provider) ? estimatedStripeFee(payment.amount) : 0,
      net: payment.amount - (isCardProvider(provider) ? estimatedStripeFee(payment.amount) : 0),
      note: payment.providerRef ?? null
    };
    const bucket = isCardProvider(provider) ? methodTotals.card : provider === "cash" ? methodTotals.cash : provider === "check" ? methodTotals.check : methodTotals.other;
    bucket.count += 1;
    bucket.gross += payment.amount;
    bucket.fees += Number(transaction.fees);
    bucket.net += Number(transaction.net);

    if (isCardProvider(provider)) {
      const depositDate = payoutDateFor(paidAt);
      const key = dateKey(depositDate);
      const status = depositDate.getTime() > now.getTime() ? "pending" : "paid";
      if (status === "pending") pendingTransactions.push(transaction);
      const group = payoutGroups.get(key) ?? {
        id: key,
        depositDate: depositDate.toISOString(),
        totalAmount: 0,
        gross: 0,
        fees: 0,
        status,
        transactions: []
      };
      group.gross += payment.amount;
      group.fees += Number(transaction.fees);
      group.totalAmount += Number(transaction.net);
      group.transactions.push(transaction);
      payoutGroups.set(key, group);
    }
  }

  const payouts = [...payoutGroups.values()].sort((left, right) => new Date(right.depositDate).getTime() - new Date(left.depositDate).getTime());
  res.json({
    range: { from: from.toISOString(), to: to.toISOString() },
    totals: {
      gross: payments.reduce((sum, payment) => sum + payment.amount, 0),
      fees: Object.values(methodTotals).reduce((sum, item) => sum + item.fees, 0),
      net: Object.values(methodTotals).reduce((sum, item) => sum + item.net, 0),
      count: payments.length
    },
    methodTotals,
    pendingTransactions,
    payouts
  });
}));

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
