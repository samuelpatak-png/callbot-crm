export const REALTIME_DEFAULT_MODEL = "gpt-realtime";
export const REALTIME_DEFAULT_VOICE = "marin";

export function resolveRealtimeModel(model?: string | null) {
  const value = (model || "").trim();
  if (!value || value === "gpt-4o-mini" || value === "gpt-4o") return REALTIME_DEFAULT_MODEL;
  if (value.includes("gpt-4o-realtime")) return REALTIME_DEFAULT_MODEL;
  return value;
}

export function realtimeSessionConfig(opts: {
  model?: string | null;
  instructions: string;
  voice?: string | null;
}) {
  const model = resolveRealtimeModel(opts.model);
  const voice = opts.voice?.trim() || REALTIME_DEFAULT_VOICE;
  return {
    type: "realtime" as const,
    model,
    instructions: opts.instructions,
    output_modalities: ["audio"] as const,
    audio: {
      input: {
        format: { type: "audio/pcmu" as const },
        transcription: { model: "gpt-4o-mini-transcribe" },
        turn_detection: {
          type: "server_vad" as const,
          threshold: 0.5,
          prefix_padding_ms: 300,
          silence_duration_ms: 600,
          create_response: true,
          interrupt_response: true,
        },
      },
      output: {
        format: { type: "audio/pcmu" as const },
        voice,
      },
    },
  };
}

type RealtimeSessionOk = {
  ok: true;
  sessionId: string | null;
  clientSecret: string | null;
  model: string;
  voice: string;
};

type RealtimeSessionErr = {
  ok: false;
  error: string;
};

function parseRealtimeSessionPayload(raw: string, model: string, voice: string): RealtimeSessionOk | null {
  try {
    const data = JSON.parse(raw) as {
      id?: string;
      value?: string;
      client_secret?: { value?: string } | string;
      session?: { id?: string };
    };
    const clientSecret =
      (typeof data.client_secret === "string" ? data.client_secret : data.client_secret?.value) ||
      data.value ||
      null;
    const sessionId = data.session?.id || data.id || null;
    if (!clientSecret && !sessionId) return null;
    return { ok: true, sessionId, clientSecret, model, voice };
  } catch {
    return null;
  }
}

export async function createRealtimeSession(opts: {
  apiKey: string;
  model: string;
  instructions: string;
  voice?: string | null;
  inputAudioFormat?: "g711_ulaw" | "audio/pcmu" | "pcm16";
  outputAudioFormat?: "g711_ulaw" | "audio/pcmu" | "pcm16";
}): Promise<RealtimeSessionOk | RealtimeSessionErr> {
  const session = realtimeSessionConfig({
    model: opts.model,
    instructions: opts.instructions,
    voice: opts.voice,
  });
  void opts.inputAudioFormat;
  void opts.outputAudioFormat;

  const ga = await fetch("https://api.openai.com/v1/realtime/client_secrets", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${opts.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ session }),
  });
  const gaRaw = await ga.text();
  if (ga.ok) {
    const parsed = parseRealtimeSessionPayload(gaRaw, session.model, session.audio.output.voice);
    if (parsed) return parsed;
  }

  const beta = await fetch("https://api.openai.com/v1/realtime/sessions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${opts.apiKey}`,
      "Content-Type": "application/json",
      "OpenAI-Beta": "realtime=v1",
    },
    body: JSON.stringify({
      model: session.model,
      voice: session.audio.output.voice,
      instructions: opts.instructions,
      modalities: ["audio", "text"],
      input_audio_format: "g711_ulaw",
      output_audio_format: "g711_ulaw",
      input_audio_transcription: { model: "whisper-1" },
    }),
  });
  const betaRaw = await beta.text();
  if (beta.ok) {
    const parsed = parseRealtimeSessionPayload(betaRaw, session.model, session.audio.output.voice);
    if (parsed) return parsed;
    return { ok: true, sessionId: null, clientSecret: null, model: session.model, voice: session.audio.output.voice };
  }

  return {
    ok: false,
    error: (ga.ok ? betaRaw : gaRaw).slice(0, 400) || `OpenAI Realtime ${ga.status}`,
  };
}

export async function loadPlaybookIntoRealtime(
  settings: {
    openaiApiKey: string | null;
    openaiRealtimeModel: string;
    openaiRealtimeVoice?: string | null;
  },
  instructions: string,
) {
  if (!settings.openaiApiKey) {
    return {
      sessionId: null as string | null,
      clientSecret: null as string | null,
      loaded: false,
      error: "OpenAI kľúč nie je v nastaveniach.",
      model: resolveRealtimeModel(settings.openaiRealtimeModel),
      voice: settings.openaiRealtimeVoice?.trim() || REALTIME_DEFAULT_VOICE,
    };
  }
  const result = await createRealtimeSession({
    apiKey: settings.openaiApiKey,
    model: settings.openaiRealtimeModel,
    instructions,
    voice: settings.openaiRealtimeVoice,
    inputAudioFormat: "g711_ulaw",
    outputAudioFormat: "g711_ulaw",
  });
  if (!result.ok) {
    return {
      sessionId: null as string | null,
      clientSecret: null as string | null,
      loaded: false,
      error: result.error,
      model: resolveRealtimeModel(settings.openaiRealtimeModel),
      voice: settings.openaiRealtimeVoice?.trim() || REALTIME_DEFAULT_VOICE,
    };
  }
  return {
    sessionId: result.sessionId,
    clientSecret: result.clientSecret,
    loaded: true,
    error: null as string | null,
    model: result.model,
    voice: result.voice,
  };
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
