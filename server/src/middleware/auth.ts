import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { env } from "../config/env.js";

export type AuthUser = {
  id: string;
  email: string;
  username: string;
  role: string;
  organizationId: string;
  locationId: string;
};

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

export function activeLocationId(req: Request) {
  if (!req.user?.locationId) {
    throw new Error("No active location selected");
  }

  return req.user.locationId;
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.header("authorization");
  const token = header?.startsWith("Bearer ") ? header.slice(7) : undefined;

  if (!token) {
    return res.status(401).json({ error: "Missing authorization token" });
  }

  try {
    req.user = jwt.verify(token, env.JWT_SECRET) as AuthUser;
    next();
  } catch {
    res.status(401).json({ error: "Invalid authorization token" });
  }
}
