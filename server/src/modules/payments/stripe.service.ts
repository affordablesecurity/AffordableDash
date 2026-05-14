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

export async function createInvoiceCheckoutSession(invoice: {
  id: string;
  total: number;
  invoiceNumber: number;
  customer?: { email: string | null; firstName?: string | null; lastName?: string | null } | null;
}, baseUrl: string) {
  if (!stripe) {
    throw new Error("Stripe is not configured");
  }

  return stripe.checkout.sessions.create({
    mode: "payment",
    customer_email: invoice.customer?.email || undefined,
    line_items: [{
      quantity: 1,
      price_data: {
        currency: "usd",
        unit_amount: invoice.total,
        product_data: {
          name: `Invoice #${invoice.invoiceNumber}`
        }
      }
    }],
    payment_intent_data: {
      metadata: {
        invoiceId: invoice.id,
        invoiceNumber: String(invoice.invoiceNumber)
      }
    },
    success_url: `${baseUrl}/?payment=success&invoice=${invoice.id}`,
    cancel_url: `${baseUrl}/?payment=cancelled&invoice=${invoice.id}`
  });
}
