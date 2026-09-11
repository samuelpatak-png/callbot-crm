export function cronSecret() {
  return process.env.CRON_SECRET || process.env.AUTH_SECRET || "";
}

export function isCronAuthorized(request: Request) {
  const secret = cronSecret();
  if (!secret) return false;
  const header = request.headers.get("authorization");
  return header === `Bearer ${secret}` || request.headers.get("x-cron-secret") === secret;
}
