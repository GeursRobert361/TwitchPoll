import { NextRequest, NextResponse } from "next/server";

import {
  attachSessionCookie,
  clearOauthStateCookie,
  createSessionToken,
  type SessionClaims
} from "@/lib/auth";
import { generateOverlaySlug } from "@/lib/crypto";
import { assertTwitchConfigured, env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { exchangeCodeForToken, fetchTwitchUser } from "@/lib/twitch";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const createWorkspaceWithUniqueSlug = async (
  ownerId: string,
  login: string,
  displayName: string,
  twitchUserId: string
) => {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      return await prisma.channelWorkspace.create({
        data: {
          ownerId,
          channelLogin: login,
          channelDisplayName: displayName,
          channelTwitchUserId: twitchUserId,
          overlaySlug: generateOverlaySlug()
        }
      });
    } catch {
      // Retry on slug collision.
    }
  }

  throw new Error("Could not create workspace with unique overlay slug");
};

export async function GET(request: NextRequest): Promise<NextResponse> {
  if (env.demoMode) {
    return NextResponse.redirect(`${env.baseUrl}/?error=oauth-disabled-in-demo-mode`);
  }

  try {
    assertTwitchConfigured();

    const queryState = request.nextUrl.searchParams.get("state");
    const code = request.nextUrl.searchParams.get("code");
    const cookieState = request.cookies.get(env.oauthStateCookie)?.value;

    if (!queryState || !code || !cookieState || queryState !== cookieState) {
      const invalidResponse = NextResponse.redirect(`${env.baseUrl}/?error=invalid-oauth-state`);
      clearOauthStateCookie(invalidResponse);
      return invalidResponse;
    }

    const token = await exchangeCodeForToken(code);
    const twitchUser = await fetchTwitchUser(token.access_token);

    const user = await prisma.user.upsert({
      where: { twitchUserId: twitchUser.id },
      create: {
        twitchUserId: twitchUser.id,
        login: twitchUser.login,
        displayName: twitchUser.display_name,
        avatarUrl: twitchUser.profile_image_url || null
      },
      update: {
        login: twitchUser.login,
        displayName: twitchUser.display_name,
        avatarUrl: twitchUser.profile_image_url || null
      }
    });

    let workspace = await prisma.channelWorkspace.findFirst({
      where: { ownerId: user.id },
      orderBy: { createdAt: "asc" }
    });

    if (!workspace) {
      workspace = await createWorkspaceWithUniqueSlug(
        user.id,
        twitchUser.login,
        twitchUser.display_name,
        twitchUser.id
      );
    }

    const claims: SessionClaims = {
      role: "OWNER",
      workspaceId: workspace.id,
      userId: user.id,
      displayName: user.displayName
    };

    const sessionToken = await createSessionToken(claims);
    const redirectTarget = workspace.channelConfirmedAt ? "/dashboard" : "/onboarding";

    const response = NextResponse.redirect(`${env.baseUrl}${redirectTarget}`);
    clearOauthStateCookie(response);
    attachSessionCookie(response, sessionToken);

    return response;
  } catch (error) {
    logger.error("Twitch OAuth callback failed", { error });
    return NextResponse.redirect(`${env.baseUrl}/?error=oauth-callback-failed`);
  }
}

