import dotenv from "dotenv";
import { z } from "zod";

dotenv.config({ path: "../.env" });
dotenv.config();

const schema = z.object({
  NODE_ENV: z.string().default("development"),
  PORT: z.coerce.number().default(4100),
  CLIENT_URL: z.string().default("http://localhost:5173"),
  DATABASE_URL: z.string(),
  JWT_SECRET: z.string().min(16),
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),
  VOIPMS_BASE_URL: z.string().default("https://voip.ms/api/v1/rest.php"),
  VOIPMS_USERNAME: z.string().optional(),
  VOIPMS_API_PASSWORD: z.string().optional(),
  VOIPMS_DID: z.string().optional(),
  HOUSECALL_PRO_BASE_URL: z.string().default("https://api.housecallpro.com"),
  HOUSECALL_PRO_API_KEY: z.string().optional(),
  HOUSECALL_PRO_WEBHOOK_SECRET: z.string().optional()
});

export const env = schema.parse(process.env);
