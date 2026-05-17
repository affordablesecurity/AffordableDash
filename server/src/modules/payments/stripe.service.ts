import Stripe from "stripe";
import { env } from "../../config/env.js";
import { prisma } from "../../db/prisma.js";

export const stripe = env.STRIPE_SECRET_KEY
  ? new Stripe(env.STRIPE_SECRET_KEY, { apiVersion: "2025-02-24.acacia" })
  : null;

type StripeCredentialMetadata = {
  stripeAccountId?: string;
  stripeUserId?: string;
};

type InvoiceCheckoutLine = {
  name: string;
  description?: string | null;
  quantity?: number | string | { toString(): string };
  unitPrice: number;
};

type InvoiceCheckoutInput = {
  id: string;
  total: number;
  tax?: number;
  invoiceNumber: number;
  locationId: string;
  customer?: { email: string | null; firstName?: string | null; lastName?: string | null } | null;
  job?: { jobNumber?: number | null; title?: string | null; jobType?: string | null } | null;
  items?: InvoiceCheckoutLine[];
};

export async function getLocationStripeAccountId(locationId: string) {
  const credential = await prisma.integrationCredential.findUnique({
    where: { locationId_provider: { locationId, provider: "stripe" } }
  });
  const metadata = credential?.metadata as StripeCredentialMetadata | null;
  return credential?.enabled ? metadata?.stripeAccountId ?? metadata?.stripeUserId ?? null : null;
}

export async function createInvoicePaymentIntent(invoice: {
  id: string;
  total: number;
  invoiceNumber: number;
  locationId: string;
}, options: { amount?: number; tipAmount?: number } = {}) {
  if (!stripe) {
    throw new Error("Stripe is not configured");
  }
  const stripeAccount = await getLocationStripeAccountId(invoice.locationId);
  if (!stripeAccount) {
    throw new Error("Stripe is not connected for this location");
  }

  return stripe.paymentIntents.create({
    amount: options.amount ?? invoice.total,
    currency: "usd",
    automatic_payment_methods: { enabled: true },
    description: `Invoice #${invoice.invoiceNumber}`,
    metadata: {
      invoiceId: invoice.id,
      invoiceNumber: String(invoice.invoiceNumber),
      invoiceTotal: String(invoice.total),
      tipAmount: String(options.tipAmount ?? 0)
    }
  }, { stripeAccount });
}

function checkoutQuantity(value: InvoiceCheckoutLine["quantity"]) {
  const quantity = Number(value ?? 1);
  return Number.isFinite(quantity) && quantity > 0 ? quantity : 1;
}

function checkoutLineItems(invoice: InvoiceCheckoutInput): Stripe.Checkout.SessionCreateParams.LineItem[] {
  const itemLines = invoice.items?.filter((item) => item.unitPrice > 0).slice(0, 20).map((item) => ({
    quantity: 1,
    price_data: {
      currency: "usd",
      unit_amount: Math.round(checkoutQuantity(item.quantity) * item.unitPrice),
      product_data: {
        name: `${item.name || `Invoice #${invoice.invoiceNumber}`}${checkoutQuantity(item.quantity) !== 1 ? ` x ${checkoutQuantity(item.quantity)}` : ""}`,
        description: item.description || invoice.job?.title || invoice.job?.jobType || undefined
      }
    }
  }));
  if (itemLines?.length) {
    if (invoice.tax && invoice.tax > 0) {
      itemLines.push({
        quantity: 1,
        price_data: {
          currency: "usd",
          unit_amount: invoice.tax,
          product_data: {
            name: "Sales tax",
            description: `Invoice #${invoice.invoiceNumber}`
          }
        }
      });
    }
    return itemLines;
  }

  const jobLabel = invoice.job?.title || invoice.job?.jobType || "Locksmith service";
  return [{
    quantity: 1,
    price_data: {
      currency: "usd",
      unit_amount: invoice.total,
      product_data: {
        name: `${jobLabel} - Invoice #${invoice.invoiceNumber}`,
        description: invoice.job?.jobNumber ? `Job #${invoice.job.jobNumber}` : "Affordable Security invoice payment"
      }
    }
  }];
}

export async function createInvoiceCheckoutSession(invoice: InvoiceCheckoutInput, baseUrl: string) {
  if (!stripe) {
    throw new Error("Stripe is not configured");
  }
  const stripeAccount = await getLocationStripeAccountId(invoice.locationId);
  if (!stripeAccount) {
    throw new Error("Stripe is not connected for this location");
  }

  return stripe.checkout.sessions.create({
    mode: "payment",
    customer_email: invoice.customer?.email || undefined,
    metadata: {
      invoiceId: invoice.id,
      invoiceNumber: String(invoice.invoiceNumber)
    },
    line_items: checkoutLineItems(invoice),
    payment_intent_data: {
      description: `Invoice #${invoice.invoiceNumber}`,
      metadata: {
        invoiceId: invoice.id,
        invoiceNumber: String(invoice.invoiceNumber)
      }
    },
    success_url: `${baseUrl}/?payment=success&invoice=${invoice.id}`,
    cancel_url: `${baseUrl}/?payment=cancelled&invoice=${invoice.id}`
  }, { stripeAccount });
}
