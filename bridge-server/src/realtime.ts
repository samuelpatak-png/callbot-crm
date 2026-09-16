import { WebSocket } from "ws";
import { config } from "./config.js";

export type RealtimeHandlers = {
  onAudio: (ulaw: Buffer) => void;
  onUserTranscript: (text: string) => void;
  onAgentTranscript: (text: string) => void;
  onError?: (message: string) => void;
  onSessionId?: (id: string) => void;
};

export function realtimeSessionUpdate(opts: { model: string; instructions: string; voice: string }) {
  return {
    type: "session.update",
    session: {
      type: "realtime",
      model: opts.model,
      instructions: opts.instructions,
      output_modalities: ["audio"],
      audio: {
        input: {
          format: { type: "audio/pcmu" },
          transcription: { model: "gpt-4o-mini-transcribe" },
          turn_detection: {
            type: "server_vad",
            threshold: 0.5,
            prefix_padding_ms: 300,
            silence_duration_ms: 600,
            create_response: true,
            interrupt_response: true,
          },
        },
        output: {
          format: { type: "audio/pcmu" },
          voice: opts.voice,
        },
      },
    },
  };
}

export class RealtimeSocket {
  private ws: WebSocket;
  private ready = false;

  constructor(ws: WebSocket) {
    this.ws = ws;
  }

  sendAudio(ulaw: Buffer) {
    if (!this.ready || this.ws.readyState !== WebSocket.OPEN) return;
    this.ws.send(
      JSON.stringify({
        type: "input_audio_buffer.append",
        audio: ulaw.toString("base64"),
      }),
    );
  }

  close() {
    if (this.ws.readyState === WebSocket.OPEN) this.ws.close();
  }

  markReady() {
    this.ready = true;
  }
}

export function connectRealtime(opts: {
  model: string;
  instructions: string;
  voice: string;
  clientSecret?: string | null;
  handlers: RealtimeHandlers;
}) {
  const token = opts.clientSecret || config.openaiApiKey;
  if (!token) {
    return Promise.reject(new Error("Chýba OpenAI kľúč aj client secret"));
  }
  const url = `wss://api.openai.com/v1/realtime?model=${encodeURIComponent(opts.model)}`;
  const ws = new WebSocket(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const socket = new RealtimeSocket(ws);

  return new Promise<RealtimeSocket>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("OpenAI Realtime timeout")), 15000);
    ws.on("open", () => {
      ws.send(JSON.stringify(realtimeSessionUpdate(opts)));
    });
    ws.on("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    ws.on("message", (raw) => {
      let event: Record<string, unknown>;
      try {
        event = JSON.parse(String(raw)) as Record<string, unknown>;
      } catch {
        return;
      }
      const type = String(event.type || "");
      if (type === "session.created" || type === "session.updated") {
        socket.markReady();
        const session = event.session as { id?: string } | undefined;
        if (session?.id) opts.handlers.onSessionId?.(session.id);
        clearTimeout(timeout);
        resolve(socket);
      }
      if (type === "error") {
        const err = event.error as { message?: string } | undefined;
        opts.handlers.onError?.(err?.message || JSON.stringify(event).slice(0, 300));
      }
      if (type === "response.output_audio.delta" || type === "response.audio.delta") {
        const audio = String(event.delta || event.audio || "");
        if (audio) opts.handlers.onAudio(Buffer.from(audio, "base64"));
      }
      if (type === "conversation.item.input_audio_transcription.completed") {
        const transcript = String(event.transcript || "");
        if (transcript.trim()) opts.handlers.onUserTranscript(transcript.trim());
      }
      if (type === "response.output_audio_transcript.done" || type === "response.audio_transcript.done") {
        const transcript = String(event.transcript || "");
        if (transcript.trim()) opts.handlers.onAgentTranscript(transcript.trim());
      }
    });
  });
}
