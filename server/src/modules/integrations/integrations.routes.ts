import { Router } from "express";
import { prisma } from "../../db/prisma.js";
import { asyncHandler } from "../../utils/async-handler.js";
import { housecallPro } from "./housecall-pro.service.js";

export const integrationsRouter = Router();

integrationsRouter.get("/status", asyncHandler(async (req, res) => {
  const credentials = await prisma.integrationCredential.findMany({
    where: { organizationId: req.user!.organizationId }
  });
  res.json({ credentials });
}));

integrationsRouter.get("/housecall-pro/company", asyncHandler(async (_req, res) => {
  const company = await housecallPro.getCompany();
  res.json({ company });
}));

integrationsRouter.post("/housecall-pro/import-preview", asyncHandler(async (_req, res) => {
  const [customers, jobs, employees, invoices] = await Promise.all([
    housecallPro.getCustomers(),
    housecallPro.getJobs(),
    housecallPro.getEmployees(),
    housecallPro.getInvoices()
  ]);

  res.json({ customers, jobs, employees, invoices });
}));
