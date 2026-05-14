import Stripe from "stripe";
import { env } from "../../config/env.js";

export const stripe = env.STRIPE_SECRET_KEY
  ? new Stripe(env.STRIPE_SECRET_KEY, { apiVersion: "2025-02-24.acacia" })
  : null;

export async function createInvoicePaymentIntent(invoice: { id: string; total: number; invoiceNumber: number }) {
  if (!stripe) {
    throw new Error("Stripe is not configured");
  }

  return stripe.paymentIntents.create({
    amount: invoice.total,
    currency: "usd",
    automatic_payment_methods: { enabled: true },
    metadata: {
      invoiceId: invoice.id,
      invoiceNumber: String(invoice.invoiceNumber)
    }
  });
}
