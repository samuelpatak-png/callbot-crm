import type { CallStatus } from "@prisma/client";

export async function transcribeCallAudio(opts: {
  audio: ArrayBuffer;
  filename?: string;
  mime?: string;
  apiKey: string;
}) {
  const form = new FormData();
  form.append(
    "file",
    new Blob([opts.audio], { type: opts.mime || "audio/mpeg" }),
    opts.filename || "call.mp3",
  );
  form.append("model", "whisper-1");
  form.append("language", "sk");
  form.append("response_format", "text");

  const response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${opts.apiKey}` },
    body: form,
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text.slice(0, 280));
  }
  return (await response.text()).trim();
}

export function twilioCallStatus(raw: string | null | undefined): CallStatus {
  switch (String(raw || "").toLowerCase()) {
    case "queued":
      return "QUEUED";
    case "ringing":
      return "RINGING";
    case "in-progress":
    case "answered":
      return "IN_PROGRESS";
    case "completed":
      return "COMPLETED";
    case "busy":
      return "BUSY";
    case "no-answer":
    case "no_answer":
      return "NO_ANSWER";
    case "failed":
      return "FAILED";
    case "canceled":
    case "cancelled":
      return "CANCELED";
    default:
      return "RINGING";
  }
}

export function outcomeFromCallStatus(status: CallStatus) {
  if (status === "NO_ANSWER") return "no_answer";
  if (status === "BUSY") return "busy";
  if (status === "VOICEMAIL") return "voicemail";
  if (status === "FAILED" || status === "CANCELED") return "failed";
  if (status === "COMPLETED") return "connected";
  return status.toLowerCase();
}
