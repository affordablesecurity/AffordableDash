import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../db/prisma.js";
import { activeLocationId } from "../../middleware/auth.js";
import { asyncHandler } from "../../utils/async-handler.js";

export const servicePlansRouter = Router();

const addOnSchema = z.object({
  item: z.string().trim().min(1),
  unitPrice: z.number().int().default(0),
  description: z.string().optional().default("")
});

const templateSchema = z.object({
  name: z.string().trim().min(1),
  description: z.string().optional().default(""),
  businessUnit: z.string().optional().default(""),
  visitsPerYear: z.number().int().min(0).default(1),
  durationType: z.enum(["indefinite", "fixed"]).default("indefinite"),
  billingInterval: z.enum(["monthly", "quarterly", "semiannual", "yearly"]).default("yearly"),
  recurringAmount: z.number().int().min(0).default(0),
  cashAllowed: z.boolean().default(false),
  discountDescription: z.string().optional().default(""),
  discountPercent: z.number().int().min(0).max(100).optional(),
  addOns: z.array(addOnSchema).default([])
});

function nextBillingLabel(interval: string) {
  const next = new Date();
  if (interval === "monthly") next.setMonth(next.getMonth() + 1);
  if (interval === "quarterly") next.setMonth(next.getMonth() + 3);
  if (interval === "semiannual") next.setMonth(next.getMonth() + 6);
  if (interval === "yearly") next.setFullYear(next.getFullYear() + 1);
  return next.toISOString();
}

servicePlansRouter.get("/", asyncHandler(async (req, res) => {
  const locationId = activeLocationId(req);
  const templates = await prisma.servicePlanTemplate.findMany({
    where: { locationId, active: true },
    orderBy: { name: "asc" }
  });
  const recurringRevenueCents = templates.reduce((sum, template) => sum + template.recurringAmount, 0);
  const yearlyRecurringRevenueCents = templates.reduce((sum, template) => {
    const multiplier = template.billingInterval === "monthly" ? 12 : template.billingInterval === "quarterly" ? 4 : template.billingInterval === "semiannual" ? 2 : 1;
    return sum + template.recurringAmount * multiplier;
  }, 0);

  res.json({
    templates,
    summary: {
      totalPlans: templates.length,
      servicePlanRevenueCents: yearlyRecurringRevenueCents,
      recurringRevenueCents,
      dueForBillingCents: recurringRevenueCents,
      upcomingScheduledVisits: templates.reduce((sum, template) => sum + template.visitsPerYear, 0),
      dueForBilling: templates.slice(0, 8).map((template) => ({
        id: template.id,
        customer: "Template ready",
        phone: "-",
        dueDate: nextBillingLabel(template.billingInterval),
        status: "Ready",
        amount: template.recurringAmount
      })),
      upcomingVisits: templates.slice(0, 8).map((template) => ({
        id: template.id,
        customerName: "Unassigned",
        address: "Attach to a customer next",
        phone: "-",
        plan: template.name,
        visitDate: `${template.visitsPerYear} visit${template.visitsPerYear === 1 ? "" : "s"} per year`,
        reminderSent: false
      }))
    }
  });
}));

servicePlansRouter.post("/templates", asyncHandler(async (req, res) => {
  if (!["OWNER", "ADMIN"].includes(req.user!.role)) {
    return res.status(403).json({ error: "Only owners and admins can manage service plans" });
  }
  const input = templateSchema.parse(req.body);
  const locationId = activeLocationId(req);
  const template = await prisma.servicePlanTemplate.upsert({
    where: { locationId_name: { locationId, name: input.name } },
    create: {
      ...input,
      locationId,
      businessUnit: input.businessUnit || null,
      discountDescription: input.discountDescription || null,
      addOns: input.addOns
    },
    update: {
      ...input,
      businessUnit: input.businessUnit || null,
      discountDescription: input.discountDescription || null,
      addOns: input.addOns,
      active: true
    }
  });
  res.status(201).json({ template });
}));

servicePlansRouter.delete("/templates/:id", asyncHandler(async (req, res) => {
  if (!["OWNER", "ADMIN"].includes(req.user!.role)) {
    return res.status(403).json({ error: "Only owners and admins can manage service plans" });
  }
  const locationId = activeLocationId(req);
  await prisma.servicePlanTemplate.updateMany({
    where: { id: String(req.params.id), locationId },
    data: { active: false }
  });
  res.status(204).send();
}));
