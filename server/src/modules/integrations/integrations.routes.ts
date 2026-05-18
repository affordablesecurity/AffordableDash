import { Router } from "express";
import jwt from "jsonwebtoken";
import type Stripe from "stripe";
import { env } from "../../config/env.js";
import { prisma } from "../../db/prisma.js";
import { activeLocationId } from "../../middleware/auth.js";
import { asyncHandler } from "../../utils/async-handler.js";
import { housecallPro } from "./housecall-pro.service.js";
import { stripe } from "../payments/stripe.service.js";

export const integrationsRouter = Router();
export const stripeOAuthRouter = Router();

type StripeConnectState = {
  purpose: "stripe_connect";
  userId: string;
  organizationId: string;
  locationId: string;
};

type StripeMetadata = {
  stripeAccountId?: string;
  stripeUserId?: string;
  livemode?: boolean;
  scope?: string;
  tokenType?: string;
  connectedAt?: string;
  disconnectedAt?: string;
};

function stripeKeyMode(value?: string) {
  if (!value) return "missing";
  if (value.startsWith("sk_test_") || value.startsWith("pk_test_")) return "test";
  if (value.startsWith("sk_live_") || value.startsWith("pk_live_")) return "live";
  return "unknown";
}

function stripeCallbackUrl() {
  return `${env.CLIENT_URL.replace(/\/+$/, "")}/api/integrations/stripe/oauth/callback`;
}

function stripeSettingsUrl(status: string) {
  return `${env.CLIENT_URL.replace(/\/+$/, "")}/settings/stripe?stripe=${encodeURIComponent(status)}`;
}

integrationsRouter.get("/status", asyncHandler(async (req, res) => {
  const credentials = await prisma.integrationCredential.findMany({
    where: {
      organizationId: req.user!.organizationId,
      OR: [{ locationId: activeLocationId(req) }, { locationId: null }]
    }
  });
  res.json({ credentials });
}));

integrationsRouter.get("/stripe/status", asyncHandler(async (req, res) => {
  const locationId = activeLocationId(req);
  const credential = await prisma.integrationCredential.findUnique({
    where: { locationId_provider: { locationId, provider: "stripe" } }
  });
  const metadata = credential?.metadata as StripeMetadata | null;
  const accountId = metadata?.stripeAccountId ?? metadata?.stripeUserId;

  let account: Stripe.Account | null = null;
  if (stripe && credential?.enabled && accountId) {
    const retrieved = await stripe.accounts.retrieve(accountId);
    account = "deleted" in retrieved && retrieved.deleted ? null : retrieved;
  }

  res.json({
    configured: Boolean(stripe && env.STRIPE_CONNECT_CLIENT_ID),
    connected: Boolean(credential?.enabled && accountId),
    accountId,
    accountMode: metadata?.livemode === true ? "live" : metadata?.livemode === false ? "test" : null,
    secretKeyMode: stripeKeyMode(env.STRIPE_SECRET_KEY),
    publishableKeyMode: stripeKeyMode(env.STRIPE_PUBLISHABLE_KEY),
    businessName: account?.business_profile?.name ?? null,
    chargesEnabled: account?.charges_enabled ?? false,
    payoutsEnabled: account?.payouts_enabled ?? false,
    detailsSubmitted: account?.details_submitted ?? false,
    dashboardUrl: "https://dashboard.stripe.com/"
  });
}));

integrationsRouter.post("/stripe/connect", asyncHandler(async (req, res) => {
  if (!stripe || !env.STRIPE_CONNECT_CLIENT_ID) {
    return res.status(422).json({ error: "Stripe Connect is not configured" });
  }

  const state = jwt.sign({
    purpose: "stripe_connect",
    userId: req.user!.id,
    organizationId: req.user!.organizationId,
    locationId: activeLocationId(req)
  } satisfies StripeConnectState, env.JWT_SECRET, { expiresIn: "10m" });

  const params = new URLSearchParams({
    response_type: "code",
    client_id: env.STRIPE_CONNECT_CLIENT_ID,
    scope: "read_write",
    redirect_uri: stripeCallbackUrl(),
    state
  });

  res.json({ url: `https://connect.stripe.com/oauth/authorize?${params.toString()}` });
}));

integrationsRouter.post("/stripe/disconnect", asyncHandler(async (req, res) => {
  if (!stripe || !env.STRIPE_CONNECT_CLIENT_ID) {
    return res.status(422).json({ error: "Stripe Connect is not configured" });
  }

  const locationId = activeLocationId(req);
  const credential = await prisma.integrationCredential.findUnique({
    where: { locationId_provider: { locationId, provider: "stripe" } }
  });
  const metadata = credential?.metadata as StripeMetadata | null;
  const stripeUserId = metadata?.stripeUserId ?? metadata?.stripeAccountId;

  if (stripeUserId) {
    await stripe.oauth.deauthorize({
      client_id: env.STRIPE_CONNECT_CLIENT_ID,
      stripe_user_id: stripeUserId
    });
  }

  if (credential) {
    await prisma.integrationCredential.update({
      where: { id: credential.id },
      data: {
        enabled: false,
        metadata: { ...metadata, disconnectedAt: new Date().toISOString() }
      }
    });
  }

  res.json({ connected: false });
}));

stripeOAuthRouter.get("/oauth/callback", asyncHandler(async (req, res) => {
  if (!stripe || !env.STRIPE_CONNECT_CLIENT_ID) {
    return res.redirect(stripeSettingsUrl("not_configured"));
  }

  const error = typeof req.query.error === "string" ? req.query.error : "";
  if (error) return res.redirect(stripeSettingsUrl("cancelled"));

  const code = typeof req.query.code === "string" ? req.query.code : "";
  const rawState = typeof req.query.state === "string" ? req.query.state : "";
  if (!code || !rawState) return res.redirect(stripeSettingsUrl("missing"));

  let state: StripeConnectState;
  try {
    state = jwt.verify(rawState, env.JWT_SECRET) as StripeConnectState;
  } catch {
    return res.redirect(stripeSettingsUrl("invalid_state"));
  }

  if (state.purpose !== "stripe_connect") return res.redirect(stripeSettingsUrl("invalid_state"));

  const token = await stripe.oauth.token({
    grant_type: "authorization_code",
    code
  }) as {
    stripe_user_id: string;
    livemode?: boolean;
    scope?: string;
    token_type?: string;
  };

  await prisma.integrationCredential.upsert({
    where: { locationId_provider: { locationId: state.locationId, provider: "stripe" } },
    update: {
      enabled: true,
      organizationId: state.organizationId,
      metadata: {
        stripeAccountId: token.stripe_user_id,
        stripeUserId: token.stripe_user_id,
        livemode: token.livemode,
        scope: token.scope,
        tokenType: token.token_type,
        connectedAt: new Date().toISOString()
      }
    },
    create: {
      organizationId: state.organizationId,
      locationId: state.locationId,
      provider: "stripe",
      enabled: true,
      metadata: {
        stripeAccountId: token.stripe_user_id,
        stripeUserId: token.stripe_user_id,
        livemode: token.livemode,
        scope: token.scope,
        tokenType: token.token_type,
        connectedAt: new Date().toISOString()
      }
    }
  });

  res.redirect(stripeSettingsUrl("connected"));
}));

integrationsRouter.get("/housecall-pro/company", asyncHandler(async (_req, res) => {
  const company = await housecallPro.getCompany();
  res.json({ company });
}));

integrationsRouter.post("/housecall-pro/import-preview", asyncHandler(async (_req, res) => {
  const [customers, jobs, employees, invoices] = await Promise.all([
    housecallPro.getCustomers(),
    housecallPro.getJobs(),
    housecallPro.getEmployees(),
    housecallPro.getInvoices()
  ]);

  res.json({ customers, jobs, employees, invoices });
}));
