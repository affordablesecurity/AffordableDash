import crypto from "node:crypto";

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
