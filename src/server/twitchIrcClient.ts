import WebSocket from "ws";

import { logger } from "@/lib/logger";

export type TwitchChatMessage = {
  channel: string;
  username: string;
  message: string;
  raw: string;
};

type ChatListener = (payload: TwitchChatMessage) => void;

const WS_ENDPOINT = "wss://irc-ws.chat.twitch.tv:443";

const normalizeChannel = (channel: string): string => channel.replace(/^#/, "").trim().toLowerCase();

export class TwitchIrcClient {
  private ws: WebSocket | null = null;
  private readonly listeners = new Set<ChatListener>();
  private readonly channels = new Set<string>();
  private reconnectAttempts = 0;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private stopped = false;
  private readonly nick = `justinfan${Math.floor(Math.random() * 900000) + 100000}`;

  start(): void {
    this.stopped = false;
    this.connect();
  }

  stop(): void {
    this.stopped = true;

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    this.ws?.close();
    this.ws = null;
  }

  onMessage(listener: ChatListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  joinChannel(channel: string): void {
    const normalized = normalizeChannel(channel);
    if (!normalized) {
      return;
    }

    this.channels.add(normalized);
    this.sendRaw(`JOIN #${normalized}`);
  }

  leaveChannel(channel: string): void {
    const normalized = normalizeChannel(channel);
    if (!normalized) {
      return;
    }

    this.channels.delete(normalized);
    this.sendRaw(`PART #${normalized}`);
  }

  private connect(): void {
    if (this.stopped) {
      return;
    }

    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return;
    }

    logger.info("Connecting to Twitch IRC", { nick: this.nick });
    this.ws = new WebSocket(WS_ENDPOINT);

    this.ws.on("open", () => {
      logger.info("Connected to Twitch IRC");
      this.reconnectAttempts = 0;
      this.sendRaw("CAP REQ :twitch.tv/tags twitch.tv/commands");
      this.sendRaw("PASS SCHMOOPIIE");
      this.sendRaw(`NICK ${this.nick}`);
      this.channels.forEach((channel) => this.sendRaw(`JOIN #${channel}`));
    });

    this.ws.on("message", (data) => {
      const payload = data.toString("utf8");
      payload
        .split("\r\n")
        .map((line) => line.trim())
        .filter(Boolean)
        .forEach((line) => this.handleLine(line));
    });

    this.ws.on("error", (error) => {
      logger.error("Twitch IRC error", { error: error.message });
    });

    this.ws.on("close", () => {
      logger.warn("Twitch IRC connection closed");
      this.ws = null;
      this.scheduleReconnect();
    });
  }

  private scheduleReconnect(): void {
    if (this.stopped || this.reconnectTimer) {
      return;
    }

    const delay = Math.min(30000, 1000 * 2 ** this.reconnectAttempts) + Math.floor(Math.random() * 500);
    this.reconnectAttempts += 1;

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay);

    logger.warn("Scheduled Twitch IRC reconnect", { delayMs: delay });
  }

  private sendRaw(line: string): void {
    if (!line) {
      return;
    }

    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return;
    }

    this.ws.send(`${line}\r\n`);
  }

  private handleLine(line: string): void {
    if (line.startsWith("PING")) {
      const token = line.split(":")[1] ?? "tmi.twitch.tv";
      this.sendRaw(`PONG :${token}`);
      return;
    }

    const match = line.match(/^(?:@[^ ]+ )?:([^!]+)![^ ]+ PRIVMSG #([^ ]+) :([\s\S]+)$/);
    if (!match) {
      return;
    }

    const [, username, channel, message] = match;
    const payload: TwitchChatMessage = {
      channel: normalizeChannel(channel),
      username: username.toLowerCase(),
      message,
      raw: line
    };

    this.listeners.forEach((listener) => {
      listener(payload);
    });
  }
}

export const twitchIrcClient = new TwitchIrcClient();

