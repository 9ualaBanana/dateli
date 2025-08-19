import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getToken } from 'next-auth/jwt';

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Only protect the root and the /dates route (including subpaths)
  if (pathname === '/' || pathname === '/dates' || pathname.startsWith('/dates/')) {
    const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
    if (!token) {
      const signInUrl = new URL('/api/auth/signin', req.url);
      // preserve where the user was going
      signInUrl.searchParams.set('callbackUrl', req.nextUrl.toString());
      return NextResponse.redirect(signInUrl);
    }
  }
  return NextResponse.next();
}

export const config = {
  matcher: ['/', '/dates/:path*'],
};
