import dotenv from "dotenv";
import { z } from "zod";

dotenv.config({ path: "../.env" });
dotenv.config();

const schema = z.object({
  NODE_ENV: z.string().default("development"),
  PORT: z.coerce.number().default(4100),
  CLIENT_URL: z.string().default("http://localhost:5173"),
  PUBLIC_BASE_URL: z.string().url().default("https://affordabledash.onrender.com").transform((value) => (
    value.replace(/\/+$/, "") === "https://affordable-onrender.com"
      ? "https://affordabledash.onrender.com"
      : value.replace(/\/+$/, "")
  )),
  DATABASE_URL: z.string(),
  JWT_SECRET: z.string().min(16),
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_PUBLISHABLE_KEY: z.string().optional(),
  STRIPE_CONNECT_CLIENT_ID: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),
  GOOGLE_MAPS_API_KEY: z.string().optional(),
  VOIPMS_BASE_URL: z.string().default("https://voip.ms/api/v1/rest.php"),
  VOIPMS_USERNAME: z.string().optional(),
  VOIPMS_API_PASSWORD: z.string().optional(),
  VOIPMS_DID: z.string().optional(),
  RESEND_API_KEY: z.string().optional(),
  EMAIL_FROM: z.string().optional(),
  EMAIL_REPLY_TO: z.string().optional(),
  HOUSECALL_PRO_BASE_URL: z.string().default("https://api.housecallpro.com"),
  HOUSECALL_PRO_API_KEY: z.string().optional(),
  HOUSECALL_PRO_WEBHOOK_SECRET: z.string().optional()
});

export const env = schema.parse(process.env);
