import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ulawBufferToPcm16 } from "./codec.js";

export class DualRecorder {
  private caller: Int16Array[] = [];
  private agent: Int16Array[] = [];
  private startedAt = Date.now();

  pushCaller(ulaw: Buffer) {
    this.caller.push(ulawBufferToPcm16(ulaw));
  }

  pushAgent(ulaw: Buffer) {
    this.agent.push(ulawBufferToPcm16(ulaw));
  }

  durationSec() {
    return Math.max(0, Math.round((Date.now() - this.startedAt) / 1000));
  }

  wav() {
    const left = concatPcm(this.caller);
    const right = concatPcm(this.agent);
    const frames = Math.max(left.length, right.length);
    const dataSize = frames * 4;
    const buf = Buffer.alloc(44 + dataSize);
    buf.write("RIFF", 0);
    buf.writeUInt32LE(36 + dataSize, 4);
    buf.write("WAVE", 8);
    buf.write("fmt ", 12);
    buf.writeUInt32LE(16, 16);
    buf.writeUInt16LE(1, 20);
    buf.writeUInt16LE(2, 22);
    buf.writeUInt32LE(8000, 24);
    buf.writeUInt32LE(8000 * 2 * 2, 28);
    buf.writeUInt16LE(4, 32);
    buf.writeUInt16LE(16, 34);
    buf.write("data", 36);
    buf.writeUInt32LE(dataSize, 40);
    for (let i = 0; i < frames; i += 1) {
      buf.writeInt16LE(left[i] || 0, 44 + i * 4);
      buf.writeInt16LE(right[i] || 0, 46 + i * 4);
    }
    return buf;
  }
}

function concatPcm(chunks: Int16Array[]) {
  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const out = new Int16Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}

export async function wavToMp3(wav: Buffer) {
  const dir = await mkdtemp(join(tmpdir(), "callbot-"));
  const wavPath = join(dir, "call.wav");
  const mp3Path = join(dir, "call.mp3");
  await writeFile(wavPath, wav);
  try {
    await new Promise<void>((resolve, reject) => {
      const child = spawn("ffmpeg", ["-y", "-hide_banner", "-loglevel", "error", "-i", wavPath, "-codec:a", "libmp3lame", "-b:a", "48k", mp3Path], {
        stdio: "ignore",
      });
      child.on("error", reject);
      child.on("exit", (code) => {
        if (code === 0) resolve();
        else reject(new Error(`ffmpeg skončil s kódom ${code}`));
      });
    });
    return { buffer: await readFile(mp3Path), contentType: "audio/mpeg", ext: "mp3" as const };
  } catch {
    return { buffer: wav, contentType: "audio/wav", ext: "wav" as const };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
