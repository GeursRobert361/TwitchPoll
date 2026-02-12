import { SignJWT, jwtVerify } from "jose";
import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";

import { env } from "@/lib/env";

export type SessionRole = "OWNER" | "MOD";

export type SessionClaims = {
  role: SessionRole;
  workspaceId: string;
  userId?: string;
  moderatorId?: string;
  displayName?: string;
};

const encoder = new TextEncoder();
const sessionSecret = encoder.encode(env.sessionSecret);

export const createSessionToken = async (claims: SessionClaims): Promise<string> => {
  const nowSeconds = Math.floor(Date.now() / 1000);

  return new SignJWT({ ...claims })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt(nowSeconds)
    .setExpirationTime(nowSeconds + 60 * 60 * 24 * 30)
    .sign(sessionSecret);
};

export const verifySessionToken = async (token: string): Promise<SessionClaims | null> => {
  try {
    const verified = await jwtVerify(token, sessionSecret);
    return verified.payload as SessionClaims;
  } catch {
    return null;
  }
};

export const attachSessionCookie = (response: NextResponse, token: string): void => {
  response.cookies.set({
    name: env.sessionCookie,
    value: token,
    httpOnly: true,
    sameSite: "lax",
    secure: env.secureCookies,
    path: "/",
    maxAge: 60 * 60 * 24 * 30
  });
};

export const clearSessionCookie = (response: NextResponse): void => {
  response.cookies.set({
    name: env.sessionCookie,
    value: "",
    httpOnly: true,
    sameSite: "lax",
    secure: env.secureCookies,
    path: "/",
    maxAge: 0
  });
};

export const createOauthState = (): string => randomBytes(24).toString("base64url");

export const attachOauthStateCookie = (response: NextResponse, state: string): void => {
  response.cookies.set({
    name: env.oauthStateCookie,
    value: state,
    httpOnly: true,
    sameSite: "lax",
    secure: env.secureCookies,
    path: "/",
    maxAge: 60 * 10
  });
};

export const clearOauthStateCookie = (response: NextResponse): void => {
  response.cookies.set({
    name: env.oauthStateCookie,
    value: "",
    httpOnly: true,
    sameSite: "lax",
    secure: env.secureCookies,
    path: "/",
    maxAge: 0
  });
};

