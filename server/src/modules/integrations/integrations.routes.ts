import { Router } from "express";
import jwt from "jsonwebtoken";
import type Stripe from "stripe";
import { z } from "zod";
import { env } from "../../config/env.js";
import { prisma } from "../../db/prisma.js";
import { activeLocationId } from "../../middleware/auth.js";
import { asyncHandler } from "../../utils/async-handler.js";
import { housecallPro } from "./housecall-pro.service.js";
import {
  activeStripeMode,
  getLocationStripeConfig,
  getLocationStripeCredential,
  locationStripeSettings,
  maskStripeValue,
  stripeKeyMode,
  type StripeCredentialMetadata,
  type StripeMode
} from "../payments/stripe.service.js";

export const integrationsRouter = Router();
export const stripeOAuthRouter = Router();

type StripeConnectState = {
  purpose: "stripe_connect";
  userId: string;
  organizationId: string;
  locationId: string;
  mode: StripeMode;
};

const stripeSettingsSchema = z.object({
  activeMode: z.enum(["test", "live"]),
  test: z.object({
    secretKey: z.string().trim().optional(),
    publishableKey: z.string().trim().optional(),
    connectClientId: z.string().trim().optional(),
    webhookSecret: z.string().trim().optional()
  }).optional(),
  live: z.object({
    secretKey: z.string().trim().optional(),
    publishableKey: z.string().trim().optional(),
    connectClientId: z.string().trim().optional(),
    webhookSecret: z.string().trim().optional()
  }).optional()
});

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
  const config = await getLocationStripeConfig(locationId);
  const metadata = config.metadata;
  const mode = config.mode;
  const testSettings = locationStripeSettings(metadata, "test");
  const liveSettings = locationStripeSettings(metadata, "live");

  let account: Stripe.Account | null = null;
  if (config.stripe && config.accountId) {
    const retrieved = await config.stripe.accounts.retrieve(config.accountId);
    account = "deleted" in retrieved && retrieved.deleted ? null : retrieved;
  }

  res.json({
    configured: Boolean(config.stripe && config.connectClientId),
    connected: Boolean(config.accountId),
    accountId: config.accountId,
    activeMode: mode,
    accountMode: mode,
    secretKeyMode: stripeKeyMode(config.settings.secretKey),
    publishableKeyMode: stripeKeyMode(config.settings.publishableKey),
    settings: {
      test: {
        secretKey: maskStripeValue(testSettings.secretKey),
        publishableKey: maskStripeValue(testSettings.publishableKey),
        connectClientId: maskStripeValue(testSettings.connectClientId),
        webhookSecret: maskStripeValue(testSettings.webhookSecret)
      },
      live: {
        secretKey: maskStripeValue(liveSettings.secretKey),
        publishableKey: maskStripeValue(liveSettings.publishableKey),
        connectClientId: maskStripeValue(liveSettings.connectClientId),
        webhookSecret: maskStripeValue(liveSettings.webhookSecret)
      }
    },
    businessName: account?.business_profile?.name ?? null,
    chargesEnabled: account?.charges_enabled ?? false,
    payoutsEnabled: account?.payouts_enabled ?? false,
    detailsSubmitted: account?.details_submitted ?? false,
    dashboardUrl: "https://dashboard.stripe.com/"
  });
}));

integrationsRouter.post("/stripe/settings", asyncHandler(async (req, res) => {
  const locationId = activeLocationId(req);
  const input = stripeSettingsSchema.parse(req.body);
  const { credential, metadata } = await getLocationStripeCredential(locationId);
  const mergeModeSettings = (mode: StripeMode) => {
    const existing = metadata[mode] ?? {};
    const incoming = input[mode] ?? {};
    return {
      ...existing,
      ...Object.fromEntries(Object.entries(incoming).filter(([, value]) => value && !String(value).includes("...")))
    };
  };
  const nextMetadata: StripeCredentialMetadata = {
    ...metadata,
    activeMode: input.activeMode,
    test: mergeModeSettings("test"),
    live: mergeModeSettings("live")
  };

  await prisma.integrationCredential.upsert({
    where: { locationId_provider: { locationId, provider: "stripe" } },
    update: {
      organizationId: req.user!.organizationId,
      metadata: nextMetadata
    },
    create: {
      organizationId: req.user!.organizationId,
      locationId,
      provider: "stripe",
      enabled: false,
      metadata: nextMetadata
    }
  });
  res.json({ saved: true });
}));

integrationsRouter.post("/stripe/connect", asyncHandler(async (req, res) => {
  const config = await getLocationStripeConfig(activeLocationId(req));
  if (!config.stripe || !config.connectClientId) {
    return res.status(422).json({ error: "Stripe Connect is not configured" });
  }

  const state = jwt.sign({
    purpose: "stripe_connect",
    userId: req.user!.id,
    organizationId: req.user!.organizationId,
    locationId: activeLocationId(req),
    mode: config.mode
  } satisfies StripeConnectState, env.JWT_SECRET, { expiresIn: "10m" });

  const params = new URLSearchParams({
    response_type: "code",
    client_id: config.connectClientId,
    scope: "read_write",
    redirect_uri: stripeCallbackUrl(),
    state
  });

  res.json({ url: `https://connect.stripe.com/oauth/authorize?${params.toString()}` });
}));

integrationsRouter.post("/stripe/disconnect", asyncHandler(async (req, res) => {
  const locationId = activeLocationId(req);
  const config = await getLocationStripeConfig(locationId);
  if (!config.stripe || !config.connectClientId) {
    return res.status(422).json({ error: "Stripe Connect is not configured" });
  }

  const credential = config.credential;
  const metadata = config.metadata;
  const stripeUserId = config.accountId;

  if (stripeUserId) {
    await config.stripe.oauth.deauthorize({
      client_id: config.connectClientId,
      stripe_user_id: stripeUserId
    });
  }

  if (credential) {
    const accountsByMode = {
      ...(metadata.accountsByMode ?? {}),
      [config.mode]: {
        ...(metadata.accountsByMode?.[config.mode] ?? {}),
        disconnectedAt: new Date().toISOString()
      }
    };
    await prisma.integrationCredential.update({
      where: { id: credential.id },
      data: {
        enabled: false,
        metadata: { ...metadata, accountsByMode, disconnectedAt: new Date().toISOString() }
      }
    });
  }

  res.json({ connected: false });
}));

stripeOAuthRouter.get("/oauth/callback", asyncHandler(async (req, res) => {
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
  const config = await getLocationStripeConfig(state.locationId);
  if (!config.stripe || !config.connectClientId) {
    return res.redirect(stripeSettingsUrl("not_configured"));
  }

  const token = await config.stripe.oauth.token({
    grant_type: "authorization_code",
    code
  }) as {
    stripe_user_id: string;
    livemode?: boolean;
    scope?: string;
    token_type?: string;
  };

  const existing = await getLocationStripeCredential(state.locationId);
  const metadata = existing.metadata;
  const account = {
    stripeAccountId: token.stripe_user_id,
    stripeUserId: token.stripe_user_id,
    livemode: token.livemode,
    scope: token.scope,
    tokenType: token.token_type,
    connectedAt: new Date().toISOString()
  };
  const nextMetadata: StripeCredentialMetadata = {
    ...metadata,
    activeMode: state.mode,
    stripeAccountId: token.stripe_user_id,
    stripeUserId: token.stripe_user_id,
    livemode: token.livemode,
    scope: token.scope,
    tokenType: token.token_type,
    connectedAt: account.connectedAt,
    accountsByMode: {
      ...(metadata.accountsByMode ?? {}),
      [state.mode]: account
    }
  };

  await prisma.integrationCredential.upsert({
    where: { locationId_provider: { locationId: state.locationId, provider: "stripe" } },
    update: {
      enabled: true,
      organizationId: state.organizationId,
      metadata: nextMetadata
    },
    create: {
      organizationId: state.organizationId,
      locationId: state.locationId,
      provider: "stripe",
      enabled: true,
      metadata: nextMetadata
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
