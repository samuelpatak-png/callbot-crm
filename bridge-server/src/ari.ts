import { WebSocket } from "ws";
import { ariAuthHeader, config } from "./config.js";

export type AriChannel = {
  id: string;
  name: string;
  state?: string;
  caller?: { number?: string; name?: string };
  connected?: { number?: string };
  dialplan?: { context?: string; exten?: string };
};

export type AriEvent = {
  type: string;
  application?: string;
  args?: string[];
  channel?: AriChannel;
  cause?: number;
  cause_txt?: string;
};

export class AriClient {
  private ws: WebSocket | null = null;
  private listeners = new Set<(event: AriEvent) => void>();

  onEvent(listener: (event: AriEvent) => void) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  async connect() {
    const url = new URL(config.ariUrl.replace(/^http/, "ws") + "/events");
    url.searchParams.set("api_key", `${config.ariUser}:${config.ariPassword}`);
    url.searchParams.set("app", "callbot");
    url.searchParams.set("subscribeAll", "true");
    await this.open(url);
  }

  private open(url: URL) {
    return new Promise<void>((resolve, reject) => {
      let opened = false;
      const ws = new WebSocket(url);
      this.ws = ws;
      ws.once("open", () => {
        opened = true;
        resolve();
      });
      ws.once("error", (error) => {
        if (!opened) reject(error);
      });
      ws.on("message", (raw) => {
        try {
          const event = JSON.parse(String(raw)) as AriEvent;
          this.listeners.forEach((listener) => listener(event));
        } catch {
          // ignore malformed ARI frames
        }
      });
      ws.on("close", () => {
        if (!opened) return;
        setTimeout(() => {
          this.open(url).catch((error) => console.error("ARI reconnect", error));
        }, 2000);
      });
    });
  }

  private async request<T>(method: string, path: string, body?: Record<string, string | number | boolean>) {
    const url = new URL(config.ariUrl + path);
    const headers: Record<string, string> = { Authorization: ariAuthHeader() };
    let init: RequestInit = { method, headers };
    if (body && method !== "GET") {
      headers["Content-Type"] = "application/json";
      init = { method, headers, body: JSON.stringify(body) };
    }
    const response = await fetch(url, init);
    const raw = await response.text();
    if (!response.ok) {
      throw new Error(`ARI ${method} ${path} ${response.status}: ${raw.slice(0, 280)}`);
    }
    if (!raw) return {} as T;
    return JSON.parse(raw) as T;
  }

  originate(opts: { endpoint: string; appArgs: string; callerId?: string }) {
    const qs = new URLSearchParams({
      endpoint: opts.endpoint,
      app: "callbot",
      appArgs: opts.appArgs,
      timeout: "45",
    });
    if (opts.callerId) qs.set("callerId", opts.callerId);
    return this.request<AriChannel>("POST", `/channels?${qs.toString()}`);
  }

  answer(channelId: string) {
    return this.request("POST", `/channels/${encodeURIComponent(channelId)}/answer`);
  }

  hangup(channelId: string) {
    return this.request("DELETE", `/channels/${encodeURIComponent(channelId)}`).catch(() => undefined);
  }

  createBridge() {
    return this.request<{ id: string }>("POST", "/bridges?type=mixing");
  }

  addChannel(bridgeId: string, channelId: string) {
    return this.request("POST", `/bridges/${encodeURIComponent(bridgeId)}/addChannel?channel=${encodeURIComponent(channelId)}`);
  }

  destroyBridge(bridgeId: string) {
    return this.request("DELETE", `/bridges/${encodeURIComponent(bridgeId)}`).catch(() => undefined);
  }

  createExternalMedia(host: string, port: number) {
    const qs = new URLSearchParams({
      app: "callbot",
      external_host: `${host}:${port}`,
      format: "ulaw",
      encapsulation: "rtp",
      transport: "udp",
      connection_type: "client",
      direction: "both",
    });
    return this.request<AriChannel>("POST", `/channels/externalMedia?${qs.toString()}`);
  }
}

export function isExternalMedia(channel?: AriChannel | null) {
  const name = channel?.name || "";
  return /UnicastRTP|ExternalMedia|RTP/i.test(name);
}
