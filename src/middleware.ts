import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/**
 * Middleware for Agent Bazaar.
 *
 * Auth is per-request in the route handlers themselves (see
 * src/lib/auth/identify.ts), which accept either Telegram initData (HMAC
 * validated, needs TELEGRAM_BOT_TOKEN) or a wallet address — neither of
 * which the Edge middleware runtime can validate on its own. A previous
 * version of this file did a shallow "is *a* x-telegram-init-data header
 * present" check here, which was redundant with the route-level check and
 * actively broke the wallet-identity path (it only recognized one of the
 * two valid auth methods). Left as a passthrough / extension point.
 */
export async function middleware(_request: NextRequest) {
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
