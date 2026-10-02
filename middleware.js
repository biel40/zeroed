import { next } from '@vercel/functions';
import { enabled, sessionEmail } from './server/beta-access.mjs';

export const config = { runtime: 'nodejs' };

export default function middleware(request) {
  if (!enabled()) return next();
  const url = new URL(request.url);
  if (['/beta.html', '/api/beta', '/favicon.ico', '/favicon.svg', '/privacy.html'].includes(url.pathname)) {
    return next({ headers: { 'Cache-Control': 'private, no-store' } });
  }
  if (sessionEmail(request.headers.get('cookie') ?? '')) {
    return next({ headers: { 'Cache-Control': 'private, no-store' } });
  }
  if (request.headers.get('sec-fetch-dest') === 'document' || url.pathname === '/' || url.pathname === '/index.html') {
    return new Response(null, { status: 302, headers: { Location: '/beta.html', 'Cache-Control': 'no-store' } });
  }
  return new Response('Acceso reservado a la beta cerrada.', { status: 401, headers: { 'Cache-Control': 'no-store' } });
}
