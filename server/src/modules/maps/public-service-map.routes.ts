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
    .filter((attachment) => attachment.startsWith("data:image/") || /^https?:\/\/.*\.(png|jpe?g|gif|webp)(?:[?#].*)?$/i.test(attachment))
    .slice(0, 8);
}

function seoFilePart(value: string | null | undefined) {
  return (value ?? "")
    .replace(/[^a-z0-9]+/gi, "_")
    .replace(/^_+|_+$/g, "")
    .toUpperCase();
}

function streetNameOnly(street: string | null | undefined) {
  return (street ?? "")
    .replace(/^\s*\d+[a-z]?\s+/i, "")
    .replace(/\s+(?:apt|apartment|unit|suite|ste|#)\s*[\w-]+$/i, "")
    .trim();
}

function publicAreaName(input: {
  city?: string | null;
  postalCode?: string | null;
}) {
  return [input.city, input.postalCode].filter(Boolean).join(" ");
}

function hashText(value: string) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }
  return hash;
}

function publicCoordinates(jobId: string, latitude: unknown, longitude: unknown) {
  const lat = decimalNumber(latitude);
  const lng = decimalNumber(longitude);
  if (lat === null || lng === null) return { latitude: null, longitude: null };

  const hash = hashText(jobId);
  const angle = ((hash % 360) * Math.PI) / 180;
  const distanceMiles = 0.14 + ((hash % 7) * 0.02);
  const latitudeOffset = distanceMiles / 69;
  const longitudeOffset = distanceMiles / (Math.max(Math.cos((lat * Math.PI) / 180), 0.2) * 69);

  return {
    latitude: Number((lat + Math.sin(angle) * latitudeOffset).toFixed(6)),
    longitude: Number((lng + Math.cos(angle) * longitudeOffset).toFixed(6))
  };
}

function publicImageName(input: {
  jobNumber: number;
  street?: string | null;
  city?: string | null;
  state?: string | null;
  neighborhood?: string | null;
}) {
  const parts = [
    `large_${input.jobNumber}`,
    seoFilePart(input.city),
    seoFilePart(streetNameOnly(input.street)),
    seoFilePart(input.state),
    "USA",
    "AFFORDABLE_SECURITY",
    "LOCKSMITH_AND_ALARM",
    seoFilePart(input.neighborhood)
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
      const areaName = publicAreaName({
        city: address?.city ?? location.city,
        postalCode: address?.postalCode ?? location.postalCode
      });
      const mappedCoordinates = publicCoordinates(job.id, address?.latitude, address?.longitude);
      return {
        id: job.id,
        jobNumber: job.jobNumber,
        completedAt: job.completedAt ?? job.scheduledStart,
        jobType: job.jobType,
        title: job.title,
        city: address?.city ?? location.city,
        state: address?.state ?? location.state,
        postalCode: address?.postalCode ?? location.postalCode,
        neighborhood: areaName,
        latitude: mappedCoordinates.latitude,
        longitude: mappedCoordinates.longitude,
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
          state: address?.state ?? location.state,
          neighborhood: areaName
        })
      };
    })
  });
}));
