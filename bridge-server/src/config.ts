import "dotenv/config";

function required(name: string, fallback = "") {
  return (process.env[name] || fallback).trim();
}

export const config = {
  port: Number(process.env.PORT || 8787),
  appUrl: required("APP_URL").replace(/\/$/, ""),
  cronSecret: required("CRON_SECRET") || required("AUTH_SECRET"),
  openaiApiKey: required("OPENAI_API_KEY"),
  ariUrl: required("ASTERISK_ARI_URL", "http://127.0.0.1:8088/ari").replace(/\/$/, ""),
  ariUser: required("ASTERISK_ARI_USER", "callbot"),
  ariPassword: required("ASTERISK_ARI_PASSWORD", "changeme"),
  externalHost: required("ASTERISK_EXTERNAL_HOST", "127.0.0.1"),
  zadarmaApiKey: required("ZADARMA_API_KEY"),
  zadarmaApiSecret: required("ZADARMA_API_SECRET"),
  sipNumber: required("ZADARMA_SIP_NUMBER"),
  sipPassword: required("ZADARMA_SIP_PASSWORD"),
  blobToken: required("BLOB_READ_WRITE_TOKEN"),
  udpPortStart: Number(process.env.BRIDGE_UDP_PORT_START || 40000),
};

export function ariAuthHeader() {
  return `Basic ${Buffer.from(`${config.ariUser}:${config.ariPassword}`).toString("base64")}`;
}
