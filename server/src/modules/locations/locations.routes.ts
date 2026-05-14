import { UserRole } from "@prisma/client";
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../db/prisma.js";
import { asyncHandler } from "../../utils/async-handler.js";

export const locationsRouter = Router();

const locationSchema = z.object({
  name: z.string().min(1),
  slug: z.string().min(2).regex(/^[a-z0-9-]+$/).optional(),
  phone: z.string().optional(),
  street1: z.string().optional(),
  street2: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  postalCode: z.string().optional(),
  timezone: z.string().default("America/Phoenix")
});

const companySettingsSchema = z.object({
  companyName: z.string().min(1),
  phone: z.string().optional(),
  street1: z.string().optional(),
  street2: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  postalCode: z.string().optional(),
  timezone: z.string().min(1),
  companyColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  website: z.string().optional(),
  industry: z.string().optional(),
  description: z.string().optional(),
  termsOfService: z.string().optional(),
  logoName: z.string().optional()
});

function slugify(value: string) {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

locationsRouter.get("/", asyncHandler(async (req, res) => {
  const memberships = await prisma.userMembership.findMany({
    where: { userId: req.user!.id },
    include: { organization: true, location: true },
    orderBy: { createdAt: "asc" }
  });

  res.json({
    activeLocationId: req.user!.locationId,
    locations: memberships.filter((item) => item.location).map((item) => ({
      role: item.role,
      organization: item.organization,
      location: item.location
    }))
  });
}));

locationsRouter.post("/", asyncHandler(async (req, res) => {
  if (!["OWNER", "ADMIN"].includes(req.user!.role)) {
    return res.status(403).json({ error: "Only owners and admins can create locations" });
  }

  const input = locationSchema.parse(req.body);
  const location = await prisma.location.create({
    data: {
      organizationId: req.user!.organizationId,
      name: input.name,
      slug: input.slug ?? slugify(input.name),
      phone: input.phone,
      street1: input.street1,
      street2: input.street2,
      city: input.city,
      state: input.state,
      postalCode: input.postalCode,
      timezone: input.timezone,
      memberships: {
        create: {
          userId: req.user!.id,
          organizationId: req.user!.organizationId,
          role: req.user!.role as UserRole
        }
      }
    }
  });

  res.status(201).json({ location });
}));

locationsRouter.patch("/active/company-settings", asyncHandler(async (req, res) => {
  if (!["OWNER", "ADMIN"].includes(req.user!.role)) {
    return res.status(403).json({ error: "Only owners and admins can update company settings" });
  }

  const input = companySettingsSchema.parse(req.body);
  const [organization, location] = await prisma.$transaction([
    prisma.organization.update({
      where: { id: req.user!.organizationId },
      data: { name: input.companyName }
    }),
    prisma.location.update({
      where: { id: req.user!.locationId },
      data: {
        name: input.companyName,
        phone: input.phone || null,
        street1: input.street1 || null,
        street2: input.street2 || null,
        city: input.city || null,
        state: input.state || null,
        postalCode: input.postalCode || null,
        timezone: input.timezone,
        companyColor: input.companyColor,
        website: input.website || null,
        industry: input.industry || null,
        description: input.description || null,
        termsOfService: input.termsOfService || null,
        logoName: input.logoName || null
      }
    })
  ]);

  res.json({ organization, location });
}));
