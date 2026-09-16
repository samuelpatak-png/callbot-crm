import { after } from "next/server";
import { NextResponse } from "next/server";
import { handleRealtimeIncomingCall, monitorRealtimeSipCall } from "@/lib/openai-sip";
import { verifyOpenAiWebhook } from "@/lib/openai-webhook";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

type IncomingEvent = {
  type?: string;
  data?: {
    call_id?: string;
    session_id?: string;
    sip_headers?: Array<{ name?: string; value?: string }>;
  };
};

export async function POST(request: Request) {
  const raw = await request.text();
  if (!verifyOpenAiWebhook(raw, request, process.env.OPENAI_WEBHOOK_SECRET || null)) {
    return NextResponse.json({ error: "invalid signature" }, { status: 400 });
  }

  let event: IncomingEvent;
  try {
    event = JSON.parse(raw) as IncomingEvent;
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const type = String(event.type || "");
  if (type !== "realtime.call.incoming" && type !== "live.call.incoming" && type !== "live.transport.incoming") {
    return NextResponse.json({ ok: true, ignored: type });
  }

  const openaiCallId = String(event.data?.call_id || event.data?.session_id || "").trim();
  if (!openaiCallId) {
    return NextResponse.json({ error: "call_id chýba" }, { status: 400 });
  }

  try {
    const accepted = await handleRealtimeIncomingCall({
      openaiCallId,
      sipHeaders: event.data?.sip_headers || [],
    });
    after(() =>
      monitorRealtimeSipCall({
        callId: accepted.callId,
        openaiCallId: accepted.openaiCallId,
        apiKey: accepted.apiKey,
      }).catch((error) => console.error("OpenAI SIP monitor", error)),
    );
    return NextResponse.json({ ok: true, callId: accepted.callId });
  } catch (error) {
    const message = error instanceof Error ? error.message : "sip error";
    console.error("OpenAI SIP incoming", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
