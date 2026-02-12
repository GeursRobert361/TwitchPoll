import { NextResponse } from "next/server";

import { clearSessionCookie } from "@/lib/auth";
import { env } from "@/lib/env";

export const runtime = "nodejs";

export async function POST(): Promise<NextResponse> {
  const response = NextResponse.json({ ok: true });
  clearSessionCookie(response);
  return response;
}

export async function GET(): Promise<NextResponse> {
  const response = NextResponse.redirect(`${env.baseUrl}/`);
  clearSessionCookie(response);
  return response;
}

