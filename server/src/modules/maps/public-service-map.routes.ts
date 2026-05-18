import { Router } from "express";
import { prisma } from "../../db/prisma.js";
import { asyncHandler } from "../../utils/async-handler.js";

export const publicServiceMapRouter = Router();

function decimalNumber(value: unknown) {
  if (value === null || value === undefined) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function publicImageUrls(attachments: string[]) {
  return attachments
    .map((attachment) => attachment.trim())
    .filter((attachment) => attachment.startsWith("https://") || attachment.startsWith("data:image/") || /\.(png|jpe?g|gif|webp)$/i.test(attachment))
    .slice(0, 8);
}

function seoFilePart(value: string | null | undefined) {
  return (value ?? "")
    .replace(/[^a-z0-9]+/gi, "_")
    .replace(/^_+|_+$/g, "")
    .toUpperCase();
}

function publicImageName(input: {
  jobNumber: number;
  street?: string | null;
  city?: string | null;
  state?: string | null;
}) {
  const parts = [
    `large_${input.jobNumber}`,
    seoFilePart(input.city),
    seoFilePart(input.street),
    seoFilePart(input.state),
    "USA",
    "AFFORDABLE_SECURITY",
    "LOCKSMITH_AND_ALARM"
  ].filter(Boolean);
  return `${parts.join("__")}.jpg`;
}

function summaryForJob(job: { description: string | null; title: string; jobType: string; lineItems: Array<{ name: string; description: string | null }> }) {
  const line = job.lineItems[0];
  return job.description || line?.description || line?.name || job.title || `${job.jobType} service`;
}

publicServiceMapRouter.get("/:locationKey", asyncHandler(async (req, res) => {
  const locationKey = String(req.params.locationKey);
  const location = await prisma.location.findFirst({
    where: { OR: [{ id: locationKey }, { slug: locationKey }] },
    include: { organization: true }
  });
  if (!location) return res.status(404).json({ error: "Service map not found" });

  const jobs = await prisma.job.findMany({
    where: {
      locationId: location.id,
      status: "COMPLETED"
    },
    include: {
      address: true,
      customer: { include: { addresses: true } },
      lineItems: true
    },
    orderBy: [{ completedAt: "desc" }, { scheduledStart: "desc" }],
    take: 500
  });

  res.json({
    location: {
      id: location.id,
      name: location.displayName || location.organization.name || location.name,
      city: location.city,
      state: location.state,
      postalCode: location.postalCode,
      companyColor: location.companyColor,
      logoDataUrl: typeof location.invoiceSettings === "object" && location.invoiceSettings && "logoDataUrl" in location.invoiceSettings
        ? String((location.invoiceSettings as { logoDataUrl?: unknown }).logoDataUrl ?? "")
        : ""
    },
    range: "all",
    jobs: jobs.map((job) => {
      const address = job.address ?? job.customer.addresses[0] ?? null;
      const imageUrls = publicImageUrls(job.attachments);
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
        customerFirstName: job.customer.firstName,
        customerLastInitial: job.customer.lastName?.slice(0, 1) ?? "",
        tags: job.tags,
        imageUrl: imageUrls[0] ?? null,
        imageUrls,
        imageName: publicImageName({
          jobNumber: job.jobNumber,
          street: address?.street1,
          city: address?.city ?? location.city,
          state: address?.state ?? location.state
        })
      };
    })
  });
}));
