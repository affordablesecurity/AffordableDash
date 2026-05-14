import crypto from "node:crypto";
import { env } from "../../config/env.js";

export function createLocationApiToken() {
  const raw = crypto.randomBytes(32).toString("base64url");
  const token = `lcrm_live_${raw}`;

  return {
    token,
    tokenPrefix: `${token.slice(0, 18)}...`,
    tokenHash: hashApiToken(token)
  };
}

export function hashApiToken(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function tokenCipherKey() {
  return crypto.createHash("sha256").update(env.JWT_SECRET).digest();
}

export function encryptApiToken(token: string) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", tokenCipherKey(), iv);
  const encrypted = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv, tag, encrypted].map((part) => part.toString("base64url")).join(".");
}

export function decryptApiToken(tokenCipher?: string | null) {
  if (!tokenCipher) return undefined;
  try {
    const [ivText, tagText, encryptedText] = tokenCipher.split(".");
    if (!ivText || !tagText || !encryptedText) return undefined;
    const decipher = crypto.createDecipheriv("aes-256-gcm", tokenCipherKey(), Buffer.from(ivText, "base64url"));
    decipher.setAuthTag(Buffer.from(tagText, "base64url"));
    return Buffer.concat([
      decipher.update(Buffer.from(encryptedText, "base64url")),
      decipher.final()
    ]).toString("utf8");
  } catch {
    return undefined;
  }
}
