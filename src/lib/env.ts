const toBool = (value: string | undefined, fallback = false): boolean => {
  if (value === undefined) {
    return fallback;
  }

  return value.toLowerCase() === "true";
};

export const env = {
  nodeEnv: process.env.NODE_ENV ?? "development",
  baseUrl: process.env.BASE_URL ?? "http://localhost:3000",
  twitchClientId: process.env.TWITCH_CLIENT_ID ?? "",
  twitchClientSecret: process.env.TWITCH_CLIENT_SECRET ?? "",
  twitchBotEnabled: toBool(process.env.TWITCH_BOT_ENABLED, false),
  twitchBotUsername: (process.env.TWITCH_BOT_USERNAME ?? "").trim().toLowerCase(),
  twitchBotOauthToken: (process.env.TWITCH_BOT_OAUTH_TOKEN ?? "").trim(),
  sessionSecret: process.env.SESSION_SECRET ?? "change-me-in-production",
  databaseUrl: process.env.DATABASE_URL ?? "file:./dev.db",
  demoMode: toBool(process.env.DEMO_MODE, false),
  secureCookies: (process.env.NODE_ENV ?? "development") === "production",
  oauthStateCookie: "tp_oauth_state",
  sessionCookie: "tp_session"
};

export const assertTwitchConfigured = (): void => {
  if (!env.twitchClientId || !env.twitchClientSecret) {
    throw new Error("TWITCH_CLIENT_ID and TWITCH_CLIENT_SECRET are required when DEMO_MODE is false");
  }
};

