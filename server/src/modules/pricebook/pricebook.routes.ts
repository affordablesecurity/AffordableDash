import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../db/prisma.js";
import { activeLocationId } from "../../middleware/auth.js";
import { asyncHandler } from "../../utils/async-handler.js";

export const priceBookRouter = Router();

const categorySchema = z.object({
  name: z.string().trim().min(1),
  description: z.string().optional()
});

const itemSchema = z.object({
  name: z.string().trim().min(1),
  modelNumber: z.string().optional(),
  itemType: z.enum(["service", "material"]).default("service"),
  description: z.string().optional(),
  price: z.number().int().default(0),
  cost: z.number().int().default(0),
  taxable: z.boolean().default(true),
  onlineBooking: z.boolean().default(false),
  imageName: z.string().optional(),
  categoryId: z.string().optional()
});

priceBookRouter.get("/", asyncHandler(async (req, res) => {
  const locationId = activeLocationId(req);
  const q = typeof req.query.q === "string" ? req.query.q : "";
  const [categories, items] = await Promise.all([
    prisma.priceBookCategory.findMany({ where: { locationId }, orderBy: { name: "asc" } }),
    prisma.priceBookItem.findMany({
      where: {
        locationId,
        active: true,
        ...(q ? {
          OR: [
            { name: { contains: q, mode: "insensitive" } },
            { description: { contains: q, mode: "insensitive" } },
            { modelNumber: { contains: q, mode: "insensitive" } }
          ]
        } : {})
      },
      include: { category: true },
      orderBy: [{ itemType: "asc" }, { name: "asc" }]
    })
  ]);
  res.json({ categories, items });
}));

priceBookRouter.post("/categories", asyncHandler(async (req, res) => {
  if (!["OWNER", "ADMIN"].includes(req.user!.role)) {
    return res.status(403).json({ error: "Only owners and admins can manage the price book" });
  }
  const input = categorySchema.parse(req.body);
  const locationId = activeLocationId(req);
  const category = await prisma.priceBookCategory.upsert({
    where: { locationId_name: { locationId, name: input.name } },
    create: { ...input, locationId },
    update: { description: input.description }
  });
  res.status(201).json({ category });
}));

priceBookRouter.post("/items", asyncHandler(async (req, res) => {
  if (!["OWNER", "ADMIN"].includes(req.user!.role)) {
    return res.status(403).json({ error: "Only owners and admins can manage the price book" });
  }
  const input = itemSchema.parse(req.body);
  const locationId = activeLocationId(req);
  const item = await prisma.priceBookItem.create({
    data: { ...input, locationId },
    include: { category: true }
  });
  res.status(201).json({ item });
}));

priceBookRouter.patch("/items/:id", asyncHandler(async (req, res) => {
  if (!["OWNER", "ADMIN"].includes(req.user!.role)) {
    return res.status(403).json({ error: "Only owners and admins can manage the price book" });
  }
  const input = itemSchema.partial().parse(req.body);
  const existing = await prisma.priceBookItem.findFirst({ where: { id: String(req.params.id), locationId: activeLocationId(req) } });
  if (!existing) return res.status(404).json({ error: "Price book item not found" });
  const item = await prisma.priceBookItem.update({
    where: { id: existing.id },
    data: input,
    include: { category: true }
  });
  res.json({ item });
}));

priceBookRouter.delete("/items/:id", asyncHandler(async (req, res) => {
  if (!["OWNER", "ADMIN"].includes(req.user!.role)) {
    return res.status(403).json({ error: "Only owners and admins can manage the price book" });
  }
  const existing = await prisma.priceBookItem.findFirst({ where: { id: String(req.params.id), locationId: activeLocationId(req) } });
  if (!existing) return res.status(404).json({ error: "Price book item not found" });
  await prisma.priceBookItem.update({ where: { id: existing.id }, data: { active: false } });
  res.status(204).send();
}));
