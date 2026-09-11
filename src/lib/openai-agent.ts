export async function createRealtimeSession(opts: {
  apiKey: string;
  model: string;
  instructions: string;
}) {
  const response = await fetch("https://api.openai.com/v1/realtime/sessions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${opts.apiKey}`,
      "Content-Type": "application/json",
      "OpenAI-Beta": "realtime=v1",
    },
    body: JSON.stringify({
      model: opts.model || "gpt-4o-realtime-preview",
      voice: "coral",
      instructions: opts.instructions,
    }),
  });
  const raw = await response.text();
  if (!response.ok) {
    return {
      ok: false as const,
      error: raw.slice(0, 400) || `OpenAI Realtime ${response.status}`,
    };
  }
  const data = JSON.parse(raw) as { id?: string };
  return { ok: true as const, sessionId: data.id || null };
}

export async function loadPlaybookIntoRealtime(
  settings: { openaiApiKey: string | null; openaiRealtimeModel: string },
  instructions: string,
) {
  if (!settings.openaiApiKey) {
    return { sessionId: null as string | null, loaded: false, error: "OpenAI kľúč nie je v nastaveniach." };
  }
  const result = await createRealtimeSession({
    apiKey: settings.openaiApiKey,
    model: settings.openaiRealtimeModel,
    instructions,
  });
  if (!result.ok) {
    return { sessionId: null as string | null, loaded: false, error: result.error };
  }
  return { sessionId: result.sessionId, loaded: true, error: null as string | null };
}

export async function rehearseWithChatGpt(opts: {
  apiKey: string;
  instructions: string;
  customerLine: string;
}) {
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${opts.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      temperature: 0.4,
      messages: [
        {
          role: "system",
          content: `${opts.instructions}

Odpovedz ako v živom telefonáte: 2 až 5 krátkych viet po slovensky. Argumentuj len faktami z briefingu vyššie. Ak briefing fakt nemá, priznaj to a ponúkni overenie.`,
        },
        {
          role: "user",
          content: `Zákazník na linke práve povedal: „${opts.customerLine.trim()}“`,
        },
      ],
    }),
  });
  const raw = await response.text();
  if (!response.ok) {
    return { ok: false as const, error: raw.slice(0, 400) || `OpenAI ${response.status}` };
  }
  const data = JSON.parse(raw) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const reply = data.choices?.[0]?.message?.content?.trim();
  if (!reply) return { ok: false as const, error: "ChatGPT nevrátil odpoveď." };
  return { ok: true as const, reply };
}
