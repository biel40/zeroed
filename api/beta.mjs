import { enabled, allowed, normalizeEmail, signToken, verifyToken, sessionEmail,
  SESSION_COOKIE, SESSION_SECONDS, LINK_SECONDS } from '../server/beta-access.mjs';
import { sendBetaEmail } from '../server/beta-mail.mjs';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('Referrer-Policy', 'no-referrer');
  if (req.method === 'GET') return res.status(200).json({ enabled: enabled(), authorized: !enabled() || !!sessionEmail(req.headers.cookie) });
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'method' });
  }
  if (!enabled()) return res.status(409).json({ error: 'disabled' });
  try {
    const origin = new URL(process.env.BETA_SITE_URL).origin;
    if (req.headers.origin !== origin) return res.status(403).json({ error: 'origin' });
    if (!req.headers['content-type']?.startsWith('application/json')) return res.status(415).json({ error: 'content-type' });
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    if (!body || typeof body !== 'object') return res.status(400).json({ error: 'body' });
    if (body.action === 'redeem') {
      const email = verifyToken(body.token, 'link');
      if (!email) return res.status(401).json({ error: 'expired' });
      res.setHeader('Set-Cookie', `${SESSION_COOKIE}=${signToken(email, 'session', SESSION_SECONDS)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${SESSION_SECONDS}`);
      return res.status(200).json({ status: 'authorized' });
    }
    const email = normalizeEmail(body.email);
    if (!email || !['login', 'request'].includes(body.action) || body.website) return res.status(400).json({ error: 'email' });
    if (body.action === 'login') {
      if (!allowed(email)) return res.status(200).json({ status: 'denied' });
      const token = signToken(email, 'link', LINK_SECONDS);
      await sendBetaEmail('login', email, `Abre este enlace para jugar a Zeroed:\n\n${origin}/beta.html#access=${token}\n\nCaduca en 15 minutos. No compartas este enlace.`);
      return res.status(200).json({ status: 'sent' });
    }
    await sendBetaEmail('request', email, `Solicitud de acceso a la beta cerrada de Zeroed.\n\nCorreo: ${email}\n\nPara aprobarla, anade este correo a BETA_ALLOWED_EMAILS en Vercel y vuelve a desplegar. Solicitar acceso no lo concede automaticamente.`);
    return res.status(200).json({ status: 'requested' });
  } catch {
    return res.status(503).json({ error: 'unavailable' });
  }
}
