"use client";

export function RecordingPlayer({
  callId,
  hasTranscript,
}: {
  callId: string;
  hasTranscript?: boolean;
}) {
  return (
    <div className="mt-3">
      <p className="mb-1 text-xs font-medium text-slate-500">Nahrávka</p>
      <audio controls preload="none" className="w-full max-w-md" src={`/api/calls/${callId}/recording`}>
        Prehliadač nevie prehrať nahrávku.
      </audio>
      {hasTranscript ? (
        <p className="mt-1 text-xs text-slate-500">
          Ak audio ešte nie je, prepis hovoru je uložený nižšie a CRM z neho berie údaje samo.
        </p>
      ) : null}
    </div>
  );
}
