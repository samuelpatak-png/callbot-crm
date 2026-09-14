import { assertTwilioSignature, parseTwilioForm, twilioUnauthorized } from "@/lib/twilio-signature";
import { continueConversation, hangupTwiml } from "@/lib/twilio-conversation";

export const maxDuration = 60;

async function handle(request: Request) {
  const params = await parseTwilioForm(request);
  try {
    await assertTwilioSignature(request, params);
  } catch {
    return twilioUnauthorized();
  }

  const callId = new URL(request.url).searchParams.get("callId") || "";
  if (!callId) {
    return hangupTwiml("Ospravedlňujem sa, hovor sa nepodarilo spárovať. Pekný deň.");
  }

  const speech = params.SpeechResult || params.UnstableSpeechResult || "";
  return continueConversation({ callId, speech });
}

export async function POST(request: Request) {
  return handle(request);
}

export async function GET(request: Request) {
  return handle(request);
}
