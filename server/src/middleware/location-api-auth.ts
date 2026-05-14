import type { NextFunction, Request, Response } from "express";
import { prisma } from "../db/prisma.js";
import { hashApiToken } from "../modules/api-keys/api-key-utils.js";

export type LocationApiAccess = {
  apiKeyId: string;
  locationId: string;
  scopes: string[];
};

declare global {
  namespace Express {
    interface Request {
      locationApiAccess?: LocationApiAccess;
    }
  }
}

export async function requireLocationApiKey(req: Request, res: Response, next: NextFunction) {
  const header = req.header("authorization");
  const token = header?.startsWith("Bearer ") ? header.slice(7) : undefined;

  if (!token) {
    return res.status(401).json({ error: "Missing location API token" });
  }

  const apiKey = await prisma.locationApiKey.findUnique({
    where: { tokenHash: hashApiToken(token) }
  });

  if (!apiKey || !apiKey.active || apiKey.revokedAt || apiKey.expiresAt && apiKey.expiresAt < new Date()) {
    return res.status(401).json({ error: "Invalid location API token" });
  }

  await prisma.locationApiKey.update({
    where: { id: apiKey.id },
    data: { lastUsedAt: new Date() }
  });

  req.locationApiAccess = {
    apiKeyId: apiKey.id,
    locationId: apiKey.locationId,
    scopes: apiKey.scopes
  };

  next();
}

export function requireLocationApiScope(scope: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.locationApiAccess?.scopes.includes(scope)) {
      return res.status(403).json({ error: `Missing API scope: ${scope}` });
    }

    next();
  };
}
