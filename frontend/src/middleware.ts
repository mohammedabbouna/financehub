import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/**
 * Server-side route protection.
 *
 * Tokens live in localStorage (read by the axios interceptor), but the
 * middleware cannot see localStorage — so the client also writes a lightweight
 * `financehub_session` marker cookie next to the tokens. This gate catches
 * unauthenticated direct navigation (hard refresh, pasted URL) before any
 * page renders or fires API calls.
 */

const PROTECTED_PREFIXES = [
  '/dashboard',
  '/wallets',
  '/actions',
  '/recurring',
  '/budgets',
  '/goals',
  '/investments',
  '/bills',
  '/calendar',
  '/ai-chat',
  '/insights',
  '/settings',
  '/reports',
  '/contacts',
  '/zakat',
  '/gold',
  '/tontines',
];

const AUTH_PAGES = ['/login', '/register'];

function hasSession(request: NextRequest): boolean {
  return request.cookies.get('financehub_session')?.value === '1';
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const authenticated = hasSession(request);

  const isProtected = PROTECTED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );

  if (isProtected && !authenticated) {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('next', pathname);
    return NextResponse.redirect(loginUrl);
  }

  if (AUTH_PAGES.includes(pathname) && authenticated) {
    return NextResponse.redirect(new URL('/dashboard', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Skip Next internals, static assets and API routes.
     */
    '/((?!api|_next/static|_next/image|favicon\\.svg|health).*)',
  ],
};
