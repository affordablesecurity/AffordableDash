import cors from "cors";
import express from "express";
import helmet from "helmet";
import morgan from "morgan";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { env } from "./config/env.js";
import { errorHandler } from "./middleware/error-handler.js";
import { requireAuth, requireRoles } from "./middleware/auth.js";
import { authRouter } from "./modules/auth/auth.routes.js";
import { apiKeysRouter } from "./modules/api-keys/api-keys.routes.js";
import { customersRouter } from "./modules/customers/customers.routes.js";
import { integrationsRouter } from "./modules/integrations/integrations.routes.js";
import { invoicesRouter } from "./modules/invoices/invoices.routes.js";
import { jobsRouter } from "./modules/jobs/jobs.routes.js";
import { locationsRouter } from "./modules/locations/locations.routes.js";
import { messagingRouter } from "./modules/messaging/messaging.routes.js";
import { paymentsRouter } from "./modules/payments/payments.routes.js";
import { priceBookRouter } from "./modules/pricebook/pricebook.routes.js";
import { publicApiRouter } from "./modules/public-api/public-api.routes.js";
import { reportsRouter } from "./modules/reports/reports.routes.js";
import { settingsRouter } from "./modules/settings/settings.routes.js";
import { techniciansRouter } from "./modules/technicians/technicians.routes.js";
import { webhooksRouter } from "./modules/webhooks/webhooks.routes.js";

export const app = express();
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const clientDistPath = path.resolve(__dirname, "../../../client/dist");

app.disable("x-powered-by");
app.use(helmet());
app.use(cors({ origin: env.CLIENT_URL, credentials: true }));
app.use(morgan("dev"));
app.use("/api/webhooks/stripe", express.raw({ type: "application/json" }));
app.use(express.json({ limit: "2mb" }));

app.get("/health", (_req, res) => res.json({ ok: true }));

app.use("/api/auth", authRouter);
app.use("/api/locations", requireAuth, locationsRouter);
app.use("/api/location-api-keys", requireAuth, apiKeysRouter);
app.use("/api/customers", requireAuth, customersRouter);
app.use("/api/jobs", requireAuth, jobsRouter);
app.use("/api/technicians", requireAuth, techniciansRouter);
app.use("/api/invoices", requireAuth, invoicesRouter);
app.use("/api/payments", requireAuth, paymentsRouter);
app.use("/api/pricebook", requireAuth, priceBookRouter);
app.use("/api/reports", requireAuth, requireRoles(["OWNER", "ADMIN"]), reportsRouter);
app.use("/api/messages", requireAuth, messagingRouter);
app.use("/api/integrations", requireAuth, integrationsRouter);
app.use("/api/settings", requireAuth, settingsRouter);
app.use("/api/webhooks", webhooksRouter);
app.use("/location-api/v1", publicApiRouter);

app.use(express.static(clientDistPath));
app.get("*", (req, res, next) => {
  if (req.path.startsWith("/api") || req.path.startsWith("/location-api")) return next();
  res.sendFile(path.join(clientDistPath, "index.html"));
});

app.use((_req, res) => {
  res.status(404).json({ error: "Not found" });
});

app.use(errorHandler);
