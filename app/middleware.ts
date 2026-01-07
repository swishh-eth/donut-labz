import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const hostname = request.headers.get('host') || '';
  
  // If old domain is requesting the manifest, serve the redirect version
  if (hostname.includes('donutlabs.vercel.app') && 
      request.nextUrl.pathname === '/.well-known/farcaster.json') {
    return NextResponse.rewrite(new URL('/api/old-manifest', request.url));
  }
  
  return NextResponse.next();
}

export const config = {
  matcher: ['/.well-known/farcaster.json'],
};