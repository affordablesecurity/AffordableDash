import { Router } from "express";
import { prisma } from "../../db/prisma.js";
import { requireLocationApiKey, requireLocationApiScope } from "../../middleware/location-api-auth.js";
import { asyncHandler } from "../../utils/async-handler.js";

export const publicApiRouter = Router();

publicApiRouter.use(requireLocationApiKey);

publicApiRouter.get("/location", asyncHandler(async (req, res) => {
  const location = await prisma.location.findUnique({
    where: { id: req.locationApiAccess!.locationId },
    include: { organization: true }
  });

  res.json({ location });
}));

publicApiRouter.get("/customers", requireLocationApiScope("customers:read"), asyncHandler(async (req, res) => {
  const customers = await prisma.customer.findMany({
    where: { locationId: req.locationApiAccess!.locationId },
    include: { addresses: true },
    orderBy: { updatedAt: "desc" },
    take: 100
  });

  res.json({ customers });
}));

publicApiRouter.get("/jobs", requireLocationApiScope("jobs:read"), asyncHandler(async (req, res) => {
  const jobs = await prisma.job.findMany({
    where: { locationId: req.locationApiAccess!.locationId },
    include: { customer: true, address: true, technician: true },
    orderBy: [{ scheduledStart: "asc" }, { createdAt: "desc" }],
    take: 100
  });

  res.json({ jobs });
}));
