import { NextResponse } from "next/server";

import { attachOauthStateCookie, createOauthState } from "@/lib/auth";
import { assertTwitchConfigured, env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { buildTwitchAuthorizeUrl } from "@/lib/twitch";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  if (env.demoMode) {
    return NextResponse.redirect(`${env.baseUrl}/?error=oauth-disabled-in-demo-mode`);
  }

  try {
    assertTwitchConfigured();

    const state = createOauthState();
    const authorizeUrl = buildTwitchAuthorizeUrl(state);

    const response = NextResponse.redirect(authorizeUrl);
    attachOauthStateCookie(response, state);

    return response;
  } catch (error) {
    logger.error("Failed to start Twitch OAuth", { error });
    return NextResponse.redirect(`${env.baseUrl}/?error=oauth-start-failed`);
  }
}

