import { createSocket, type RemoteInfo, type Socket } from "node:dgram";

const HEADER = 12;
const FRAME = 160;

export class RtpSocket {
  readonly port: number;
  private socket: Socket;
  private seq = Math.floor(Math.random() * 0xffff);
  private ts = 0;
  private ssrc = Math.floor(Math.random() * 0xffffffff);
  private peer: RemoteInfo | null = null;
  private sendQueue = Buffer.alloc(0);
  private timer: ReturnType<typeof setInterval> | null = null;
  private onPayloadCb: ((payload: Buffer) => void) | null = null;

  constructor(port: number, socket: Socket) {
    this.port = port;
    this.socket = socket;
    this.socket.on("message", (msg, rinfo) => {
      if (msg.length < HEADER) return;
      this.peer = rinfo;
      const cc = msg[0] & 0x0f;
      const extension = (msg[0] & 0x10) !== 0;
      let offset = HEADER + cc * 4;
      if (extension && msg.length >= offset + 4) {
        const extLen = msg.readUInt16BE(offset + 2);
        offset += 4 + extLen * 4;
      }
      if (offset >= msg.length) return;
      this.onPayloadCb?.(msg.subarray(offset));
    });
    this.timer = setInterval(() => this.flush(), 20);
  }

  onPayload(cb: (payload: Buffer) => void) {
    this.onPayloadCb = cb;
  }

  sendUlaw(payload: Buffer) {
    this.sendQueue = Buffer.concat([this.sendQueue, payload]);
  }

  close() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.socket.close();
  }

  private flush() {
    if (!this.peer) return;
    let chunk: Buffer;
    if (this.sendQueue.length >= FRAME) {
      chunk = this.sendQueue.subarray(0, FRAME);
      this.sendQueue = this.sendQueue.subarray(FRAME);
    } else if (this.sendQueue.length > 0) {
      chunk = this.sendQueue;
      this.sendQueue = Buffer.alloc(0);
    } else {
      chunk = Buffer.alloc(FRAME, 0xff);
    }
    const packet = Buffer.alloc(HEADER + chunk.length);
    packet[0] = 0x80;
    packet[1] = 0x00;
    packet.writeUInt16BE(this.seq++ & 0xffff, 2);
    packet.writeUInt32BE(this.ts >>> 0, 4);
    packet.writeUInt32BE(this.ssrc >>> 0, 8);
    chunk.copy(packet, HEADER);
    this.ts = (this.ts + chunk.length) >>> 0;
    this.socket.send(packet, this.peer.port, this.peer.address);
  }
}

export function bindRtp(port: number) {
  return new Promise<RtpSocket>((resolve, reject) => {
    const socket = createSocket("udp4");
    socket.once("error", reject);
    socket.bind(port, "0.0.0.0", () => {
      socket.removeListener("error", reject);
      resolve(new RtpSocket(port, socket));
    });
  });
}
