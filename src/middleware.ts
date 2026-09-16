import { NextRequest, NextResponse } from "next/server";

const PUBLIC = ["/login", "/api/cron", "/api/dialer", "/api/harvest", "/api/twilio", "/api/zadarma", "/api/openai"];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (PUBLIC.some((path) => pathname === path || pathname.startsWith(`${path}/`))) {
    return NextResponse.next();
  }
  if (pathname.startsWith("/_next") || pathname.includes(".")) {
    return NextResponse.next();
  }
  const session = request.cookies.get("cb_session")?.value;
  if (!session) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }
  if (request.cookies.get("cb_force_password")?.value && !pathname.startsWith("/nastavenia")) {
    const url = request.nextUrl.clone();
    url.pathname = "/nastavenia";
    url.searchParams.set("heslo", "1");
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api/zadarma|api/openai|_next/static|_next/image|favicon.ico|login).*)"],
};
