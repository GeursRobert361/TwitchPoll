import { createHash, randomBytes } from "node:crypto";

export const generateOverlaySlug = (): string => {
  const raw = randomBytes(9).toString("base64url");
  return raw.slice(0, 12);
};

export const generateInviteToken = (): string => randomBytes(32).toString("base64url");

export const hashToken = (token: string): string => createHash("sha256").update(token).digest("hex");

