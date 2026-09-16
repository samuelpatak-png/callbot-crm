import { createServer } from "node:http";
import { AriClient } from "./ari.js";
import { config } from "./config.js";
import { finishCall, findLiveCall, handleChannelDestroyed, handleStasisStart, startOutboundCall } from "./session.js";

function authorized(request: import("node:http").IncomingMessage) {
  if (!config.cronSecret) return false;
  const header = String(request.headers.authorization || "");
  return header === `Bearer ${config.cronSecret}` || request.headers["x-bridge-secret"] === config.cronSecret;
}

async function readJson(request: import("node:http").IncomingMessage) {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  if (!chunks.length) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8")) as Record<string, unknown>;
}

async function main() {
  const ari = new AriClient();
  for (let attempt = 1; attempt <= 30; attempt += 1) {
    try {
      await ari.connect();
      console.log("ARI pripojené", config.ariUrl);
      break;
    } catch (error) {
      if (attempt === 30) throw error;
      console.warn(`ARI pokus ${attempt} zlyhal, čakám…`);
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
  }

  ari.onEvent(async (event) => {
    try {
      if (event.type === "StasisStart" && event.channel) {
        await handleStasisStart(ari, event.channel, event.args || []);
      }
      if ((event.type === "StasisEnd" || event.type === "ChannelDestroyed") && event.channel) {
        const live = findLiveCall(event.channel.id);
        if (live && live.phoneChannelId === event.channel.id) {
          await finishCall(ari, live);
        } else if (event.type === "ChannelDestroyed") {
          await handleChannelDestroyed(event.channel.id, event.cause_txt);
        }
      }
    } catch (error) {
      console.error("ARI event", event.type, error);
    }
  });

  const server = createServer(async (request, response) => {
    try {
      const url = new URL(request.url || "/", `http://${request.headers.host || "localhost"}`);
      if (request.method === "GET" && url.pathname === "/health") {
        response.writeHead(200, { "Content-Type": "application/json" });
        response.end(JSON.stringify({ ok: true }));
        return;
      }
      if (request.method === "POST" && url.pathname === "/call") {
        if (!authorized(request)) {
          response.writeHead(401, { "Content-Type": "application/json" });
          response.end(JSON.stringify({ error: "Unauthorized" }));
          return;
        }
        const body = await readJson(request);
        const to = String(body.to || "").trim();
        const callId = String(body.callId || "").trim();
        if (!to || !callId) {
          response.writeHead(400, { "Content-Type": "application/json" });
          response.end(JSON.stringify({ error: "to a callId sú povinné" }));
          return;
        }
        const result = await startOutboundCall(ari, to, callId);
        response.writeHead(200, { "Content-Type": "application/json" });
        response.end(JSON.stringify({ ok: true, sid: result.sid, status: "queued" }));
        return;
      }
      response.writeHead(404, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ error: "Not found" }));
    } catch (error) {
      const message = error instanceof Error ? error.message : "internal";
      console.error(request.url, error);
      response.writeHead(500, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ error: message }));
    }
  });

  server.listen(config.port, () => {
    console.log(`CallBot bridge počúva na :${config.port}`);
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
