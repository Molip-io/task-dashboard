import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const PASSWORD = process.env.DASHBOARD_PASSWORD || "";
const COOKIE_NAME = "dashboard_auth";

export function proxy(request: NextRequest) {
  // 인증 미설정 시 통과
  if (!PASSWORD) return NextResponse.next();

  const { pathname } = request.nextUrl;

  // /api/ 경로는 서버사이드 전용 — 인증 없이 통과
  if (pathname.startsWith("/api/")) {
    // Vercel Cron: /api/briefing/deliver — Bearer CRON_SECRET 확인
    if (pathname.startsWith("/api/briefing/deliver")) {
      const authHeader = request.headers.get("Authorization");
      const cronSecret = process.env.CRON_SECRET || "";
      if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
        return new NextResponse("Unauthorized", { status: 401 });
      }
    }
    return NextResponse.next();
  }

  // /login?token=xxx → 쿠키 설정 후 리다이렉트
  if (pathname === "/login") {
    const token = request.nextUrl.searchParams.get("token");
    if (token === PASSWORD) {
      const res = NextResponse.redirect(new URL("/", request.url));
      res.cookies.set(COOKIE_NAME, token, {
        httpOnly: true,
        sameSite: "lax",
        maxAge: 60 * 60 * 24 * 30, // 30일
      });
      return res;
    }
    return new NextResponse("Invalid token", { status: 401 });
  }

  // 쿠키 확인
  const auth = request.cookies.get(COOKIE_NAME)?.value;
  if (auth === PASSWORD) return NextResponse.next();

  return new NextResponse("Unauthorized — /login?token=YOUR_PASSWORD 로 접근하세요", {
    status: 401,
  });
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
