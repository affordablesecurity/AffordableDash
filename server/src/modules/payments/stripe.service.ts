import Stripe from "stripe";
import { env } from "../../config/env.js";
import { prisma } from "../../db/prisma.js";

export const stripe = env.STRIPE_SECRET_KEY
  ? new Stripe(env.STRIPE_SECRET_KEY, { apiVersion: "2025-02-24.acacia" })
  : null;

export type StripeMode = "test" | "live";

export type StripeModeSettings = {
  secretKey?: string;
  publishableKey?: string;
  connectClientId?: string;
  webhookSecret?: string;
};

export type StripeConnectedAccount = {
  stripeAccountId?: string;
  stripeUserId?: string;
  livemode?: boolean;
  scope?: string;
  tokenType?: string;
  connectedAt?: string;
  disconnectedAt?: string;
};

export type StripeCredentialMetadata = {
  activeMode?: StripeMode;
  stripeAccountId?: string;
  stripeUserId?: string;
  livemode?: boolean;
  scope?: string;
  tokenType?: string;
  connectedAt?: string;
  test?: StripeModeSettings;
  live?: StripeModeSettings;
  accountsByMode?: Partial<Record<StripeMode, StripeConnectedAccount>>;
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

export function stripeKeyMode(value?: string) {
  if (!value) return "missing";
  if (value.startsWith("sk_test_") || value.startsWith("pk_test_")) return "test";
  if (value.startsWith("sk_live_") || value.startsWith("pk_live_")) return "live";
  if (value.startsWith("whsec_")) return "unknown";
  return "unknown";
}

export function maskStripeValue(value?: string) {
  if (!value) return "";
  if (value.length <= 12) return "********";
  return `${value.slice(0, 8)}...${value.slice(-4)}`;
}

function metadataObject(value: unknown): StripeCredentialMetadata {
  return value && typeof value === "object" && !Array.isArray(value) ? value as StripeCredentialMetadata : {};
}

export function activeStripeMode(metadata: StripeCredentialMetadata): StripeMode {
  if (metadata.activeMode === "live" || metadata.activeMode === "test") return metadata.activeMode;
  return metadata.livemode ? "live" : "test";
}

export function locationStripeSettings(metadata: StripeCredentialMetadata, mode = activeStripeMode(metadata)): StripeModeSettings {
  const saved = metadata[mode] ?? {};
  return {
    secretKey: saved.secretKey || env.STRIPE_SECRET_KEY,
    publishableKey: saved.publishableKey || env.STRIPE_PUBLISHABLE_KEY,
    connectClientId: saved.connectClientId || env.STRIPE_CONNECT_CLIENT_ID,
    webhookSecret: saved.webhookSecret || env.STRIPE_WEBHOOK_SECRET
  };
}

export async function getLocationStripeCredential(locationId: string) {
  const credential = await prisma.integrationCredential.findUnique({
    where: { locationId_provider: { locationId, provider: "stripe" } }
  });
  return { credential, metadata: metadataObject(credential?.metadata) };
}

export async function getLocationStripeConfig(locationId: string) {
  const { credential, metadata } = await getLocationStripeCredential(locationId);
  const mode = activeStripeMode(metadata);
  const settings = locationStripeSettings(metadata, mode);
  const account = metadata.accountsByMode?.[mode];
  const legacyMatchesMode = metadata.livemode === undefined || (mode === "live") === metadata.livemode;
  const legacyAccountId = legacyMatchesMode ? metadata.stripeAccountId ?? metadata.stripeUserId ?? null : null;
  const accountId = account?.stripeAccountId ?? account?.stripeUserId ?? legacyAccountId;
  return {
    credential,
    metadata,
    mode,
    settings,
    stripe: settings.secretKey ? new Stripe(settings.secretKey, { apiVersion: "2025-02-24.acacia" }) : null,
    publishableKey: settings.publishableKey ?? "",
    connectClientId: settings.connectClientId ?? "",
    webhookSecret: settings.webhookSecret ?? "",
    accountId: credential?.enabled ? accountId : null
  };
}

export async function getLocationStripeAccountId(locationId: string) {
  const config = await getLocationStripeConfig(locationId);
  return config.accountId;
}

export async function getAllStripeWebhookSecrets() {
  const credentials = await prisma.integrationCredential.findMany({
    where: { provider: "stripe" },
    select: { metadata: true }
  });
  const secrets = [
    env.STRIPE_WEBHOOK_SECRET,
    ...credentials.flatMap((credential) => {
      const metadata = metadataObject(credential.metadata);
      return [metadata.test?.webhookSecret, metadata.live?.webhookSecret];
    })
  ].filter((value): value is string => Boolean(value));
  return [...new Set(secrets)];
}

export async function createInvoicePaymentIntent(invoice: {
  id: string;
  total: number;
  invoiceNumber: number;
  locationId: string;
}, options: { amount?: number; tipAmount?: number } = {}) {
  const config = await getLocationStripeConfig(invoice.locationId);
  if (!config.stripe) {
    throw new Error("Stripe is not configured");
  }
  if (!config.accountId) {
    throw new Error("Stripe is not connected for this location");
  }

  return config.stripe.paymentIntents.create({
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
  }, { stripeAccount: config.accountId });
}

function checkoutQuantity(value: InvoiceCheckoutLine["quantity"]) {
  const quantity = Number(value ?? 1);
  return Number.isFinite(quantity) && quantity > 0 ? quantity : 1;
}

function checkoutLineItems(invoice: InvoiceCheckoutInput, options: { amount?: number; tipAmount?: number } = {}): Stripe.Checkout.SessionCreateParams.LineItem[] {
  if ("amount" in options && typeof options.amount === "number" && options.amount > 0 && options.amount !== invoice.total) {
    const partialLines: Stripe.Checkout.SessionCreateParams.LineItem[] = [{
      quantity: 1,
      price_data: {
        currency: "usd",
        unit_amount: options.amount,
        product_data: {
          name: `Invoice #${invoice.invoiceNumber} payment`,
          description: invoice.job?.jobNumber ? `Job #${invoice.job.jobNumber}` : "Affordable Security invoice payment"
        }
      }
    }];
    if (options.tipAmount && options.tipAmount > 0) {
      partialLines.push({
        quantity: 1,
        price_data: {
          currency: "usd",
          unit_amount: options.tipAmount,
          product_data: {
            name: "Tip",
            description: `Invoice #${invoice.invoiceNumber}`
          }
        }
      });
    }
    return partialLines;
  }

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
    if (options.tipAmount && options.tipAmount > 0) {
      itemLines.push({
        quantity: 1,
        price_data: {
          currency: "usd",
          unit_amount: options.tipAmount,
          product_data: {
            name: "Tip",
            description: `Invoice #${invoice.invoiceNumber}`
          }
        }
      });
    }
    return itemLines;
  }

  const jobLabel = invoice.job?.title || invoice.job?.jobType || "Locksmith service";
  const fallbackLines: Stripe.Checkout.SessionCreateParams.LineItem[] = [{
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
  if (options.tipAmount && options.tipAmount > 0) {
    fallbackLines.push({
      quantity: 1,
      price_data: {
        currency: "usd",
        unit_amount: options.tipAmount,
        product_data: {
          name: "Tip",
          description: `Invoice #${invoice.invoiceNumber}`
        }
      }
    });
  }
  return fallbackLines;
}

export async function createInvoiceCheckoutSession(invoice: InvoiceCheckoutInput, baseUrl: string, options: { amount?: number; tipAmount?: number; customerEmail?: string } = {}) {
  const config = await getLocationStripeConfig(invoice.locationId);
  if (!config.stripe) {
    throw new Error("Stripe is not configured");
  }
  if (!config.accountId) {
    throw new Error("Stripe is not connected for this location");
  }

  return config.stripe.checkout.sessions.create({
    mode: "payment",
    customer_email: options.customerEmail || invoice.customer?.email || undefined,
    metadata: {
      invoiceId: invoice.id,
      invoiceNumber: String(invoice.invoiceNumber),
      invoiceTotal: String(invoice.total),
      paymentAmount: String(options.amount ?? invoice.total),
      tipAmount: String(options.tipAmount ?? 0)
    },
    line_items: checkoutLineItems(invoice, options),
    payment_intent_data: {
      description: `Invoice #${invoice.invoiceNumber}`,
      metadata: {
        invoiceId: invoice.id,
        invoiceNumber: String(invoice.invoiceNumber),
        invoiceTotal: String(invoice.total),
        paymentAmount: String(options.amount ?? invoice.total),
        tipAmount: String(options.tipAmount ?? 0)
      }
    },
    success_url: `${baseUrl}/pay/${invoice.invoiceNumber}/complete?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${baseUrl}/pay/${invoice.invoiceNumber}`
  }, { stripeAccount: config.accountId });
}
