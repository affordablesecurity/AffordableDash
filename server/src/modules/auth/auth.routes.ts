import bcrypt from "bcryptjs";
import { Router } from "express";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { env } from "../../config/env.js";
import { prisma } from "../../db/prisma.js";
import { requireAuth } from "../../middleware/auth.js";
import { asyncHandler } from "../../utils/async-handler.js";

export const authRouter = Router();

const loginSchema = z.object({
  identifier: z.string().min(3),
  password: z.string().min(8)
});

const signupSchema = z.object({
  name: z.string().trim().min(1, "Your name is required"),
  email: z.string().trim().email("Enter a valid email address"),
  username: z.string().trim().toLowerCase().min(3, "Username must be at least 3 characters").regex(/^[a-z0-9._-]+$/, "Username can only use letters, numbers, dots, dashes, and underscores"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  companyName: z.string().trim().min(1, "Company is required"),
  locationName: z.string().trim().min(1, "First location is required"),
  locationSlug: z.string().min(2).regex(/^[a-z0-9-]+$/).optional(),
  phone: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  timezone: z.string().default("America/Phoenix")
});

function slugify(value: string) {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function signUserToken(user: {
  id: string;
  email: string;
  username: string;
}, membership: {
  role: string;
  organizationId: string;
  locationId: string | null;
}) {
  if (!membership.locationId) {
    throw new Error("User does not have an active location");
  }

  return signLocationToken(user, {
    role: membership.role,
    organizationId: membership.organizationId,
    locationId: membership.locationId
  });
}

function signLocationToken(user: {
  id: string;
  email: string;
  username: string;
}, access: {
  role: string;
  organizationId: string;
  locationId: string;
}) {
  return jwt.sign({
    id: user.id,
    email: user.email,
    username: user.username,
    role: access.role,
    organizationId: access.organizationId,
    locationId: access.locationId
  }, env.JWT_SECRET, { expiresIn: "12h" });
}

async function expandedLocationAccess(userId: string) {
  const memberships = await prisma.userMembership.findMany({
    where: { userId },
    include: { organization: true, location: true },
    orderBy: { createdAt: "asc" }
  });
  const access: Array<{ role: string; organization: (typeof memberships)[number]["organization"]; location: NonNullable<(typeof memberships)[number]["location"]> }> = [];

  for (const membership of memberships) {
    if (membership.location) {
      access.push({ role: membership.role, organization: membership.organization, location: membership.location });
      continue;
    }
    if (!["OWNER", "ADMIN"].includes(membership.role)) continue;
    const locations = await prisma.location.findMany({
      where: { organizationId: membership.organizationId, active: true },
      orderBy: { createdAt: "asc" }
    });
    for (const location of locations) {
      access.push({ role: membership.role, organization: membership.organization, location });
    }
  }

  const seen = new Set<string>();
  return access.filter(({ location }) => {
    if (seen.has(location.id)) return false;
    seen.add(location.id);
    return true;
  });
}

authRouter.post("/signup", asyncHandler(async (req, res) => {
  const input = signupSchema.parse(req.body);
  const passwordHash = await bcrypt.hash(input.password, 12);
  const organizationSlugBase = slugify(input.companyName);
  const locationSlug = input.locationSlug ?? slugify(input.locationName);

  const existingUser = await prisma.user.findFirst({
    where: { OR: [{ email: input.email }, { username: input.username }] }
  });

  if (existingUser) {
    return res.status(409).json({ error: "Email or username already exists" });
  }

  const result = await prisma.$transaction(async (tx) => {
    const organization = await tx.organization.create({
      data: {
        name: input.companyName,
        slug: `${organizationSlugBase}-${Date.now().toString(36)}`
      }
    });

    const location = await tx.location.create({
      data: {
        organizationId: organization.id,
        name: input.locationName,
        displayName: input.locationName,
        slug: locationSlug,
        phone: input.phone,
        city: input.city,
        state: input.state,
        timezone: input.timezone
      }
    });

    const user = await tx.user.create({
      data: {
        email: input.email,
        username: input.username,
        name: input.name,
        phone: input.phone,
        passwordHash,
        role: "OWNER"
      }
    });

    const membership = await tx.userMembership.create({
      data: {
        userId: user.id,
        organizationId: organization.id,
        locationId: location.id,
        role: "OWNER"
      }
    });

    await tx.technician.create({
      data: {
        userId: user.id,
        locationId: location.id,
        name: user.name,
        email: user.email,
        phone: input.phone || "Not set",
        employmentType: "employee",
        role: "OWNER",
        fieldTech: false,
        permissions: ["*"],
        active: true
      }
    });

    return { user, organization, location, membership };
  });

  const token = signUserToken(result.user, result.membership);
  res.status(201).json({
    token,
    user: { id: result.user.id, email: result.user.email, username: result.user.username, name: result.user.name, role: result.membership.role },
    organization: result.organization,
    location: result.location
  });
}));

authRouter.post("/login", asyncHandler(async (req, res) => {
  const input = loginSchema.parse(req.body);
  const user = await prisma.user.findFirst({
    where: {
      OR: [
        { email: input.identifier },
        { username: input.identifier }
      ]
    },
    include: {
      memberships: {
        include: { organization: true, location: true },
        orderBy: { createdAt: "asc" }
      }
    }
  });

  if (!user || !user.active || !await bcrypt.compare(input.password, user.passwordHash)) {
    return res.status(401).json({ error: "Invalid login" });
  }

  let membership = user.memberships.find((item) => item.locationId);
  let selectedLocation = membership?.location ?? null;
  if (!membership) {
    membership = user.memberships.find((item) => !item.locationId && ["OWNER", "ADMIN"].includes(item.role));
    if (membership) {
      selectedLocation = await prisma.location.findFirst({
        where: { organizationId: membership.organizationId, active: true },
        orderBy: { createdAt: "asc" }
      });
    }
  }
  if (!membership || !selectedLocation) return res.status(403).json({ error: "No location access configured" });

  const token = signLocationToken(user, {
    role: membership.role,
    organizationId: selectedLocation.organizationId,
    locationId: selectedLocation.id
  });
  const locations = await expandedLocationAccess(user.id);
  res.json({
    token,
    user: { id: user.id, email: user.email, username: user.username, name: user.name, role: membership.role },
    organization: membership.organization,
    location: selectedLocation,
    locations
  });
}));

authRouter.get("/me", requireAuth, asyncHandler(async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user!.id },
    select: {
      id: true,
      email: true,
      username: true,
      name: true,
      role: true,
      active: true,
      memberships: {
        include: { organization: true, location: true },
        orderBy: { createdAt: "asc" }
      }
    }
  });
  res.json({ user, activeLocationId: req.user!.locationId, activeOrganizationId: req.user!.organizationId });
}));

authRouter.post("/switch-location", requireAuth, asyncHandler(async (req, res) => {
  const input = z.object({ locationId: z.string() }).parse(req.body);
  const targetLocation = await prisma.location.findUnique({
    where: { id: input.locationId },
    include: { organization: true }
  });
  if (!targetLocation) return res.status(404).json({ error: "Location not found" });

  const user = await prisma.user.findUnique({
    where: { id: req.user!.id },
    include: {
      memberships: {
        where: { organizationId: targetLocation.organizationId },
        include: { organization: true, location: true }
      }
    }
  });

  const membership = user?.memberships.find((item) => item.locationId === input.locationId)
    ?? user?.memberships.find((item) => !item.locationId && ["OWNER", "ADMIN"].includes(item.role));
  if (!user || !membership) return res.status(403).json({ error: "You do not have access to that location" });

  const token = signLocationToken(user, {
    role: membership.role,
    organizationId: targetLocation.organizationId,
    locationId: targetLocation.id
  });
  res.json({ token, location: targetLocation, organization: targetLocation.organization });
}));
