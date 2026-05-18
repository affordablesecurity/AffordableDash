import { Router } from "express";
import { prisma } from "../../db/prisma.js";
import { asyncHandler } from "../../utils/async-handler.js";

export const publicServiceMapRouter = Router();

function rangeStart(range: string) {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  if (range === "today") return start;
  if (range === "week") {
    start.setDate(start.getDate() - 6);
    return start;
  }
  if (range === "quarter") {
    start.setMonth(start.getMonth() - 3);
    return start;
  }
  start.setMonth(start.getMonth() - 1);
  return start;
}

function decimalNumber(value: unknown) {
  if (value === null || value === undefined) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function publicImageUrl(attachments: string[]) {
  return attachments.find((attachment) => attachment.startsWith("https://") || attachment.startsWith("data:image/") || /\.(png|jpe?g|gif|webp)$/i.test(attachment)) ?? null;
}

function summaryForJob(job: { description: string | null; title: string; jobType: string; lineItems: Array<{ name: string; description: string | null }> }) {
  const line = job.lineItems[0];
  return job.description || line?.description || line?.name || job.title || `${job.jobType} service`;
}

publicServiceMapRouter.get("/:locationKey", asyncHandler(async (req, res) => {
  const locationKey = String(req.params.locationKey);
  const requestedRange = typeof req.query.range === "string" ? req.query.range : "month";
  const range = ["today", "week", "month", "quarter"].includes(requestedRange) ? requestedRange : "month";
  const location = await prisma.location.findFirst({
    where: { OR: [{ id: locationKey }, { slug: locationKey }] },
    include: { organization: true }
  });
  if (!location) return res.status(404).json({ error: "Service map not found" });

  const jobs = await prisma.job.findMany({
    where: {
      locationId: location.id,
      status: "COMPLETED",
      OR: [
        { completedAt: { gte: rangeStart(range) } },
        { completedAt: null, scheduledStart: { gte: rangeStart(range) } }
      ]
    },
    include: {
      address: true,
      customer: { include: { addresses: true } },
      lineItems: true
    },
    orderBy: [{ completedAt: "desc" }, { scheduledStart: "desc" }],
    take: 100
  });

  res.json({
    location: {
      id: location.id,
      name: location.displayName || location.organization.name || location.name,
      city: location.city,
      state: location.state,
      postalCode: location.postalCode,
      companyColor: location.companyColor
    },
    range,
    jobs: jobs.map((job) => {
      const address = job.address ?? job.customer.addresses[0] ?? null;
      return {
        id: job.id,
        jobNumber: job.jobNumber,
        completedAt: job.completedAt ?? job.scheduledStart,
        jobType: job.jobType,
        title: job.title,
        city: address?.city ?? location.city,
        state: address?.state ?? location.state,
        postalCode: address?.postalCode ?? location.postalCode,
        latitude: decimalNumber(address?.latitude),
        longitude: decimalNumber(address?.longitude),
        description: summaryForJob(job),
        imageUrl: publicImageUrl(job.attachments)
      };
    })
  });
}));
