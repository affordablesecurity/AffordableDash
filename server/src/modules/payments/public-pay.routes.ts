import { Router } from "express";
import { env } from "../../config/env.js";
import { prisma } from "../../db/prisma.js";
import { asyncHandler } from "../../utils/async-handler.js";
import { createInvoiceCheckoutSession } from "./stripe.service.js";

export const publicPayRouter = Router();

publicPayRouter.get("/:invoiceNumber", asyncHandler(async (req, res) => {
  const invoiceNumber = Number(req.params.invoiceNumber);
  if (!Number.isInteger(invoiceNumber) || invoiceNumber <= 0) {
    return res.status(404).send("Invoice not found");
  }

  const invoice = await prisma.invoice.findUnique({
    where: { invoiceNumber },
    include: {
      customer: true,
      job: true,
      items: true
    }
  });
  if (!invoice || invoice.status === "VOID") return res.status(404).send("Invoice not found");
  if (invoice.status === "PAID") return res.status(200).send("This invoice has already been paid.");
  if (invoice.total <= 0) return res.status(422).send("This invoice does not have an amount due.");

  const session = await createInvoiceCheckoutSession(invoice, env.PUBLIC_BASE_URL);
  if (!session.url) return res.status(502).send("Unable to open payment checkout.");
  res.redirect(303, session.url);
}));
