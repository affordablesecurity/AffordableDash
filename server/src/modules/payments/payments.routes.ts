import { Router } from "express";
import { prisma } from "../../db/prisma.js";
import { activeLocationId } from "../../middleware/auth.js";
import { asyncHandler } from "../../utils/async-handler.js";
import { createInvoiceCheckoutSession, createInvoicePaymentIntent } from "./stripe.service.js";

export const paymentsRouter = Router();

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
    include: { customer: true }
  });
  if (!invoice) return res.status(404).json({ error: "Invoice not found" });
  if (invoice.total <= 0) return res.status(422).json({ error: "Invoice total must be greater than zero" });

  const origin = req.header("origin") || `${req.protocol}://${req.get("host")}`;
  const session = await createInvoiceCheckoutSession(invoice, origin);
  res.json({ url: session.url, checkoutSessionId: session.id });
}));
