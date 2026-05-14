import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../db/prisma.js";
import { activeLocationId } from "../../middleware/auth.js";
import { asyncHandler } from "../../utils/async-handler.js";

export const settingsRouter = Router();

settingsRouter.get("/summary", asyncHandler(async (req, res) => {
  const locationId = activeLocationId(req);
  const [
    customers,
    openJobs,
    totalJobs,
    completedJobs,
    canceledJobs,
    leadJobs,
    bookedJobs,
    invoices,
    invoiceTotals,
    paidPayments,
    jobsByTypeRows,
    jobsBySourceRows
  ] = await Promise.all([
    prisma.customer.count({ where: { locationId } }),
    prisma.job.count({ where: { locationId, status: { in: ["LEAD", "SCHEDULED", "DISPATCHED", "IN_PROGRESS"] } } }),
    prisma.job.count({ where: { locationId } }),
    prisma.job.count({ where: { locationId, status: "COMPLETED" } }),
    prisma.job.count({ where: { locationId, status: "CANCELED" } }),
    prisma.job.count({ where: { locationId, status: "LEAD" } }),
    prisma.job.count({ where: { locationId, status: { in: ["SCHEDULED", "DISPATCHED", "IN_PROGRESS", "COMPLETED"] } } }),
    prisma.invoice.count({ where: { locationId } }),
    prisma.invoice.aggregate({ where: { locationId, status: { not: "VOID" } }, _sum: { total: true }, _avg: { total: true } }),
    prisma.payment.aggregate({ where: { status: "SUCCEEDED", invoice: { locationId } }, _sum: { amount: true } }),
    prisma.job.groupBy({ by: ["jobType"], where: { locationId }, _count: { _all: true } }),
    prisma.job.groupBy({ by: ["leadSource"], where: { locationId }, _count: { _all: true } })
  ]);

  const salesCents = invoiceTotals._sum.total ?? 0;
  const collectedCents = paidPayments._sum.amount ?? 0;
  const averageJobSizeCents = Math.round(invoiceTotals._avg.total ?? 0);
  const cancellationRate = totalJobs ? canceledJobs / totalJobs : 0;
  const bookingRate = totalJobs ? bookedJobs / totalJobs : 0;
  const closeRate = totalJobs ? completedJobs / totalJobs : 0;
  const jobsByType = jobsByTypeRows.map((row) => ({
    label: row.jobType,
    count: row._count._all,
    percent: totalJobs ? row._count._all / totalJobs : 0
  }));
  const jobsBySource = jobsBySourceRows.map((row) => ({
    label: row.leadSource || "Unknown",
    count: row._count._all,
    percent: totalJobs ? row._count._all / totalJobs : 0
  }));

  res.json({
    customers,
    openJobs,
    invoices,
    totalJobs,
    completedJobs,
    canceledJobs,
    leadJobs,
    bookedJobs,
    salesCents,
    collectedCents,
    revenueCents: collectedCents,
    averageJobSizeCents,
    cancellationRate,
    bookingRate,
    closeRate,
    estimateWinRatio: { won: completedJobs, total: invoices },
    jobsByType,
    jobsBySource
  });
}));

const optionKinds = ["leadSource", "tag", "jobType", "jobField", "checklist", "servicePlan"] as const;

const optionSchema = z.object({
  kind: z.enum(optionKinds),
  name: z.string().trim().min(1)
});

settingsRouter.get("/options", asyncHandler(async (req, res) => {
  const locationId = activeLocationId(req);
  const [options, jobTypes, leadSources, jobTags] = await Promise.all([
    prisma.crmOption.findMany({ where: { locationId }, orderBy: [{ kind: "asc" }, { name: "asc" }] }),
    prisma.job.findMany({ where: { locationId }, select: { jobType: true }, distinct: ["jobType"] }),
    prisma.job.findMany({ where: { locationId, leadSource: { not: null } }, select: { leadSource: true }, distinct: ["leadSource"] }),
    prisma.job.findMany({ where: { locationId }, select: { tags: true } })
  ]);

  const grouped = {
    leadSources: new Set<string>(["Unknown", "Online Booking", "Google Ads", "Facebook Ads", "Yelp Ads", "Referral", "Phone Call"]),
    tags: new Set<string>(),
    jobTypes: new Set<string>(["Car Lockout Service", "House Lockout Service", "Rekey", "Lock Install", "Car Key", "Ignition", "Safe", "Access Control"]),
    jobFields: new Set<string>(["Gate code", "Lock brand", "Key count", "Door condition", "Vehicle year/make/model"]),
    checklists: new Set<string>(["Arrival checklist", "Vehicle lockout checklist", "Rekey checklist", "Invoice review"]),
    servicePlans: new Set<string>(["Residential maintenance", "Commercial priority", "Property manager"])
  };

  options.forEach((option) => {
    if (option.kind === "leadSource") grouped.leadSources.add(option.name);
    if (option.kind === "tag") grouped.tags.add(option.name);
    if (option.kind === "jobType") grouped.jobTypes.add(option.name);
    if (option.kind === "jobField") grouped.jobFields.add(option.name);
    if (option.kind === "checklist") grouped.checklists.add(option.name);
    if (option.kind === "servicePlan") grouped.servicePlans.add(option.name);
  });
  jobTypes.forEach((row) => grouped.jobTypes.add(row.jobType));
  leadSources.forEach((row) => {
    if (row.leadSource) grouped.leadSources.add(row.leadSource);
  });
  jobTags.forEach((row) => row.tags.forEach((tag) => grouped.tags.add(tag)));

  res.json({
    leadSources: [...grouped.leadSources].sort(),
    tags: [...grouped.tags].sort(),
    jobTypes: [...grouped.jobTypes].sort(),
    jobFields: [...grouped.jobFields].sort(),
    checklists: [...grouped.checklists].sort(),
    servicePlans: [...grouped.servicePlans].sort()
  });
}));

settingsRouter.post("/options", asyncHandler(async (req, res) => {
  const input = optionSchema.parse(req.body);
  const locationId = activeLocationId(req);
  const option = await prisma.crmOption.upsert({
    where: { locationId_kind_name: { locationId, kind: input.kind, name: input.name } },
    create: { locationId, kind: input.kind, name: input.name },
    update: {}
  });
  res.status(201).json({ option });
}));

settingsRouter.delete("/options", asyncHandler(async (req, res) => {
  const input = optionSchema.parse(req.body);
  const locationId = activeLocationId(req);
  await prisma.crmOption.deleteMany({
    where: { locationId, kind: input.kind, name: input.name }
  });
  res.status(204).send();
}));
