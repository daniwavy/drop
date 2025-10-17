import { NextResponse, type NextRequest } from 'next/server';

// Server-side enforcement of maintenance mode.
// Set MAINTENANCE=1 (or true) in your environment to enable.
export function middleware(req: NextRequest) {
  try {
    const maintenance = process.env.MAINTENANCE === '1' || process.env.MAINTENANCE === 'true';
    if (!maintenance) return NextResponse.next();

    // If the request originates from localhost/127.0.0.1, skip maintenance enforcement
    // This makes local development unaffected by maintenance mode.
    const host = req.nextUrl.hostname || req.headers.get('host') || '';
    if (host.includes('localhost') || host.includes('127.0.0.1')) return NextResponse.next();

    const url = req.nextUrl.clone();
    // allow direct access to the maintenance page itself
    if (url.pathname === '/maintenance') return NextResponse.next();

    // allow api routes and _next/static and public assets
    if (url.pathname.startsWith('/api') || url.pathname.startsWith('/_next') || url.pathname.startsWith('/static') || url.pathname.startsWith('/_static')) {
      return NextResponse.next();
    }

    // allow favicon and robots
    if (url.pathname === '/favicon.ico' || url.pathname === '/robots.txt') return NextResponse.next();

    // redirect all other requests to the maintenance page
    url.pathname = '/maintenance';
    return NextResponse.rewrite(url);
  } catch {
    // on error, don't block the site
    return NextResponse.next();
  }
}

export const config = {
  matcher: '/((?!_next/static|_next/image|favicon.ico).*)',
};
