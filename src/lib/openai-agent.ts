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

export type SpokenTurn = {
  say: string;
  endCall: boolean;
  outcome: string;
  capturedEmail: string | null;
};

function scriptedTurn(opts: {
  qualifying: string;
  callToAction: string;
  turn: number;
  lastCustomer: string;
}): SpokenTurn {
  const question =
    opts.qualifying
      .split(/\r?\n/)
      .map((line) => line.replace(/^[-*•]\s*/, "").trim())
      .find(Boolean) || "Či riešite odchádzajúce hovory, alebo to teraz nie je téma?";
  const cta =
    opts.callToAction.trim() ||
    "Ak to dáva zmysel, povedzte e-mail a pošleme krátke podklady. Alebo navrhnite termín spätného hovoru.";
  if (opts.turn <= 1) {
    return { say: question, endCall: false, outcome: "connected", capturedEmail: null };
  }
  if (opts.turn === 2) {
    return { say: cta, endCall: false, outcome: "connected", capturedEmail: null };
  }
  return {
    say: "Ďakujem za čas. Ak budete chcieť, ozveme sa neskôr. Pekný deň.",
    endCall: true,
    outcome: /nechcem|nezáujem|nie/i.test(opts.lastCustomer) ? "not_interested" : "callback",
    capturedEmail: null,
  };
}

export async function nextSpokenTurn(opts: {
  apiKey: string | null;
  instructions: string;
  transcript: string;
  lastCustomer: string;
  contactName: string;
  opening: string;
  qualifying: string;
  callToAction: string;
  turn: number;
}): Promise<SpokenTurn> {
  const fallback = scriptedTurn(opts);
  if (!opts.apiKey) return fallback;

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${opts.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0.4,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content: `${opts.instructions}

Si naživo na telefóne. Vráť JSON:
{
  "say": "1 až 3 krátke vety po slovensky, hovorový jazyk, bez odrážok",
  "endCall": false,
  "outcome": "connected|interested|callback|not_interested|dnc",
  "capturedEmail": "e-mail ak ho povedal, inak null"
}
Pravidlá: neskáč do reči, nevymýšľaj ceny ani produkty. Ak máš e-mail alebo jasné nie / nevolajte, endCall=true. Po 8 výmenách hovor ukonči zdvorilo.`,
          },
          {
            role: "user",
            content: `Kontakt: ${opts.contactName}\nŤah ${opts.turn}\nPosledná veta kontaktu: ${opts.lastCustomer}\n\nPrepis:\n${opts.transcript.slice(-6000)}`,
          },
        ],
      }),
    });
    if (!response.ok) return fallback;
    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const parsed = JSON.parse(data.choices?.[0]?.message?.content || "{}") as Record<string, unknown>;
    const say = String(parsed.say || fallback.say).trim().slice(0, 500);
    if (!say) return fallback;
    return {
      say,
      endCall: Boolean(parsed.endCall),
      outcome: String(parsed.outcome || fallback.outcome),
      capturedEmail: typeof parsed.capturedEmail === "string" ? parsed.capturedEmail : null,
    };
  } catch {
    return fallback;
  }
}
