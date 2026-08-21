import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/**
 * Middleware for Agent Bazaar
 *
 * Auth strategy:
 * - Telegram Mini App: initData validated via /api/auth/telegram (client-side flow)
 * - Protected routes (/list, /dashboard) require valid Telegram initData
 * - API routes are auth'd per-request via initData header
 *
 * Since Telegram auth is client-side (initData passed from WebApp SDK),
 * middleware does lightweight checks only. Full validation happens in API routes.
 */
export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Protected page routes — require Telegram auth
  const protectedPaths = ['/list', '/dashboard', '/profile'];
  const isProtectedPage = protectedPaths.some((path) =>
    pathname.startsWith(path)
  );

  if (isProtectedPage) {
    // For pages, we rely on client-side auth check via useTelegram hook
    // The hook validates initData with /api/auth/telegram on mount
    // No server-side session to check here — Telegram auth is stateless
  }

  // Protected API routes — require valid initData header
  const protectedApiPaths = ['/api/agents']; // POST/PUT/DELETE require auth
  const isProtectedApi =
    protectedApiPaths.some((path) => pathname.startsWith(path)) &&
    ['POST', 'PUT', 'DELETE'].includes(request.method);

  if (isProtectedApi) {
    const initData = request.headers.get('x-telegram-init-data');
    if (!initData) {
      return NextResponse.json(
        { error: 'Missing Telegram auth. Send x-telegram-init-data header.' },
        { status: 401 }
      );
    }
    // Actual validation happens in the API route handler
    // (needs botToken from env, not available in edge middleware)
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api/auth (auth endpoints)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    '/((?!api/auth|_next/static|_next/image|favicon.ico).*)',
  ],
};
