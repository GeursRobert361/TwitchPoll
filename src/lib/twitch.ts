import { env } from "@/lib/env";

type TwitchTokenResponse = {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  scope: string[];
  token_type: "bearer";
};

type TwitchUser = {
  id: string;
  login: string;
  display_name: string;
  profile_image_url: string;
};

type TwitchUsersResponse = {
  data: TwitchUser[];
};

const callbackUrl = `${env.baseUrl}/api/auth/twitch/callback`;

export const buildTwitchAuthorizeUrl = (state: string): string => {
  const url = new URL("https://id.twitch.tv/oauth2/authorize");
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", env.twitchClientId);
  url.searchParams.set("redirect_uri", callbackUrl);
  url.searchParams.set("state", state);
  url.searchParams.set("scope", "");
  url.searchParams.set("force_verify", "false");
  return url.toString();
};

export const exchangeCodeForToken = async (code: string): Promise<TwitchTokenResponse> => {
  const url = new URL("https://id.twitch.tv/oauth2/token");
  url.searchParams.set("client_id", env.twitchClientId);
  url.searchParams.set("client_secret", env.twitchClientSecret);
  url.searchParams.set("code", code);
  url.searchParams.set("grant_type", "authorization_code");
  url.searchParams.set("redirect_uri", callbackUrl);

  const response = await fetch(url.toString(), {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded"
    }
  });

  if (!response.ok) {
    throw new Error(`Twitch token exchange failed with status ${response.status}`);
  }

  return (await response.json()) as TwitchTokenResponse;
};

export const fetchTwitchUser = async (accessToken: string): Promise<TwitchUser> => {
  const response = await fetch("https://api.twitch.tv/helix/users", {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Client-Id": env.twitchClientId
    }
  });

  if (!response.ok) {
    throw new Error(`Twitch users endpoint failed with status ${response.status}`);
  }

  const payload = (await response.json()) as TwitchUsersResponse;
  const user = payload.data[0];

  if (!user) {
    throw new Error("No Twitch user returned from /helix/users");
  }

  return user;
};

