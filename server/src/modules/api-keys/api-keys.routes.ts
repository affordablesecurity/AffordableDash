import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../db/prisma.js";
import { activeLocationId } from "../../middleware/auth.js";
import { asyncHandler } from "../../utils/async-handler.js";
import { createLocationApiToken } from "./api-key-utils.js";

export const apiKeysRouter = Router();

const apiKeySchema = z.object({
  name: z.string().min(1),
  scopes: z.array(z.string()).default(["customers:read", "jobs:read"]),
  expiresAt: z.string().datetime().optional()
});

function requireApiKeyAdmin(role: string) {
  return ["OWNER", "ADMIN"].includes(role);
}

apiKeysRouter.get("/", asyncHandler(async (req, res) => {
  const apiKeys = await prisma.locationApiKey.findMany({
    where: { locationId: activeLocationId(req) },
    select: {
      id: true,
      name: true,
      tokenPrefix: true,
      scopes: true,
      active: true,
      lastUsedAt: true,
      expiresAt: true,
      createdAt: true,
      revokedAt: true
    },
    orderBy: { createdAt: "desc" }
  });

  res.json({ apiKeys });
}));

apiKeysRouter.post("/", asyncHandler(async (req, res) => {
  if (!requireApiKeyAdmin(req.user!.role)) {
    return res.status(403).json({ error: "Only owners and admins can manage API access" });
  }

  const input = apiKeySchema.parse(req.body);
  const generated = createLocationApiToken();
  const apiKey = await prisma.locationApiKey.create({
    data: {
      locationId: activeLocationId(req),
      name: input.name,
      tokenPrefix: generated.tokenPrefix,
      tokenHash: generated.tokenHash,
      scopes: input.scopes,
      expiresAt: input.expiresAt ? new Date(input.expiresAt) : undefined,
      createdById: req.user!.id
    },
    select: {
      id: true,
      name: true,
      tokenPrefix: true,
      scopes: true,
      active: true,
      expiresAt: true,
      createdAt: true
    }
  });

  res.status(201).json({
    apiKey,
    token: generated.token,
    warning: "Store this token now. It will not be shown again."
  });
}));

apiKeysRouter.post("/:id/revoke", asyncHandler(async (req, res) => {
  if (!requireApiKeyAdmin(req.user!.role)) {
    return res.status(403).json({ error: "Only owners and admins can manage API access" });
  }

  const apiKey = await prisma.locationApiKey.findFirst({
    where: { id: req.params.id, locationId: activeLocationId(req) }
  });

  if (!apiKey) return res.status(404).json({ error: "API key not found" });

  const revoked = await prisma.locationApiKey.update({
    where: { id: apiKey.id },
    data: { active: false, revokedAt: new Date() },
    select: {
      id: true,
      name: true,
      tokenPrefix: true,
      active: true,
      revokedAt: true
    }
  });

  res.json({ apiKey: revoked });
}));
