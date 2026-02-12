import WebSocket from "ws";

import { env } from "@/lib/env";
import { logger } from "@/lib/logger";

const WS_ENDPOINT = "wss://irc-ws.chat.twitch.tv:443";
const MAX_MESSAGE_LENGTH = 450;
const MAX_QUEUE_SIZE = 50;

type OutgoingMessage = {
  channel: string;
  message: string;
};

const normalizeChannel = (channel: string): string => channel.replace(/^#/, "").trim().toLowerCase();

const sanitizeMessage = (message: string): string => message.replace(/[\r\n]+/g, " ").trim();

const withOauthPrefix = (token: string): string => (token.startsWith("oauth:") ? token : `oauth:${token}`);

class TwitchBotClient {
  private ws: WebSocket | null = null;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private reconnectAttempts = 0;
  private connected = false;
  private stopped = false;
  private readonly joinedChannels = new Set<string>();
  private readonly queue: OutgoingMessage[] = [];

  sendMessage(channel: string, message: string): void {
    if (!this.isConfigured()) {
      return;
    }

    const normalizedChannel = normalizeChannel(channel);
    const sanitizedMessage = sanitizeMessage(message).slice(0, MAX_MESSAGE_LENGTH);

    if (!normalizedChannel || !sanitizedMessage) {
      return;
    }

    if (this.queue.length >= MAX_QUEUE_SIZE) {
      this.queue.shift();
    }

    this.queue.push({
      channel: normalizedChannel,
      message: sanitizedMessage
    });

    this.stopped = false;
    this.connect();
    this.flushQueue();
  }

  stop(): void {
    this.stopped = true;
    this.connected = false;
    this.joinedChannels.clear();
    this.queue.length = 0;

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    this.ws?.close();
    this.ws = null;
  }

  private isConfigured(): boolean {
    return env.twitchBotEnabled && !!env.twitchBotUsername && !!env.twitchBotOauthToken;
  }

  private connect(): void {
    if (!this.isConfigured() || this.stopped) {
      return;
    }

    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return;
    }

    this.ws = new WebSocket(WS_ENDPOINT);

    this.ws.on("open", () => {
      this.reconnectAttempts = 0;
      this.connected = false;
      this.sendRaw("CAP REQ :twitch.tv/commands");
      this.sendRaw(`PASS ${withOauthPrefix(env.twitchBotOauthToken)}`);
      this.sendRaw(`NICK ${env.twitchBotUsername}`);
    });

    this.ws.on("message", (data) => {
      const payload = data.toString("utf8");
      payload
        .split("\r\n")
        .map((line) => line.trim())
        .filter(Boolean)
        .forEach((line) => this.handleLine(line));
    });

    this.ws.on("close", () => {
      this.ws = null;
      this.connected = false;
      this.joinedChannels.clear();

      if (!this.stopped && this.queue.length > 0) {
        this.scheduleReconnect();
      }
    });

    this.ws.on("error", (error) => {
      logger.error("Twitch bot IRC error", { error: error.message });
    });
  }

  private handleLine(line: string): void {
    if (line.startsWith("PING")) {
      const token = line.split(":")[1] ?? "tmi.twitch.tv";
      this.sendRaw(`PONG :${token}`);
      return;
    }

    if (line.includes("Login authentication failed")) {
      logger.error("Twitch bot authentication failed; announcements disabled until restart");
      this.stop();
      return;
    }

    if (/\s001\s/.test(line)) {
      this.connected = true;
      this.flushQueue();
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer || this.stopped || this.queue.length === 0) {
      return;
    }

    const delay = Math.min(30000, 1000 * 2 ** this.reconnectAttempts);
    this.reconnectAttempts += 1;

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay);
  }

  private flushQueue(): void {
    if (!this.connected || !this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return;
    }

    while (this.queue.length > 0) {
      const next = this.queue.shift();
      if (!next) {
        continue;
      }

      if (!this.joinedChannels.has(next.channel)) {
        this.joinedChannels.add(next.channel);
        this.sendRaw(`JOIN #${next.channel}`);
      }

      this.sendRaw(`PRIVMSG #${next.channel} :${next.message}`);
    }
  }

  private sendRaw(line: string): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return;
    }

    this.ws.send(`${line}\r\n`);
  }
}

export const twitchBotClient = new TwitchBotClient();
