import type { LoginEmail } from './LoginMailer';

/** The game's languages (`src/i18n`); unknown values fall back to English. */
export type EmailLanguage = 'en' | 'es' | 'ca';

/** The game's PWA icon, served from `public/`; mail clients need a PNG on a public URL. */
export const LOGO_PATH = '/pwa-192x192.png';
/** Animated Station 33 header, built by `scripts/generate-email-banner.mjs` into `public/`. */
export const BANNER_PATH = '/assets/email/login-banner.gif';

export interface LoginEmailOptions {
  readonly to: string;
  /** Built by the API from its own configuration and a URL-safe token, so it needs no HTML escaping. */
  readonly link: string;
  readonly expiryMinutes: number;
  readonly language: EmailLanguage;
  /** The game's public origin, which also serves the logo. */
  readonly appUrl: string;
}

interface LoginCopy {
  readonly subject: string;
  readonly kicker: string;
  readonly intro: string;
  readonly action: string;
  readonly expiry: (minutes: number) => string;
  readonly fallback: string;
  readonly ignore: string;
}

const COPY: Readonly<Record<EmailLanguage, LoginCopy>> = {
  en: {
    subject: 'Your Zeroed sign-in link',
    kicker: 'ACCOUNT ACCESS',
    intro: 'Use this link to sign in to Zeroed:',
    action: 'Sign in',
    expiry: (minutes) => `It works once and expires in ${minutes} minutes.`,
    fallback: 'If the button does not work, copy this link into your browser:',
    ignore: 'If you did not ask for it, you can ignore this email.',
  },
  es: {
    subject: 'Tu enlace para entrar en Zeroed',
    kicker: 'ACCESO A TU CUENTA',
    intro: 'Usa este enlace para iniciar sesión en Zeroed:',
    action: 'Iniciar sesión',
    expiry: (minutes) => `Solo funciona una vez y caduca en ${minutes} minutos.`,
    fallback: 'Si el botón no funciona, copia este enlace en tu navegador:',
    ignore: 'Si no lo has pedido, puedes ignorar este correo.',
  },
  ca: {
    subject: 'El teu enllaç per entrar a Zeroed',
    kicker: 'ACCÉS AL TEU COMPTE',
    intro: 'Fes servir aquest enllaç per iniciar sessió a Zeroed:',
    action: 'Inicia sessió',
    expiry: (minutes) => `Només funciona una vegada i caduca en ${minutes} minuts.`,
    fallback: 'Si el botó no funciona, copia aquest enllaç al navegador:',
    ignore: 'Si no l’has demanat, pots ignorar aquest correu.',
  },
};

// Menu palette from `src/style.css`: near-black, bone text, beta gold and blood red.
const COLORS = {
  page: '#06090d',
  card: '#121110',
  border: '#3a3022',
  red: '#c9433a',
  gold: '#d9b469',
  buttonText: '#17140d',
  title: '#dedfd8',
  text: '#b9bdb4',
  muted: '#8e968a',
} as const;

// Entrance, a failing-neon flicker on the title and a breathing button glow; off for reduced motion.
const ANIMATIONS = [
  '@keyframes zr-rise{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:none}}',
  '@keyframes zr-flicker{0%,18%,22%,62%,64%,100%{opacity:1}20%,63%{opacity:.35}}',
  '@keyframes zr-glow{0%,100%{box-shadow:0 0 10px rgba(217,180,105,.25)}50%{box-shadow:0 0 26px rgba(217,180,105,.6)}}',
  '.zr-logo{animation:zr-rise .6s ease-out both}',
  '.zr-title{animation:zr-rise .6s ease-out .1s both,zr-flicker 4s linear 1s infinite}',
  '.zr-card{animation:zr-rise .7s ease-out .25s both}',
  '.zr-button{animation:zr-glow 2.4s ease-in-out 1s infinite}',
  '@media (prefers-reduced-motion:reduce){.zr-logo,.zr-title,.zr-card,.zr-button{animation:none!important}}',
].join('');

const SANS = "'Segoe UI', Roboto, Helvetica, Arial, sans-serif";
const DISPLAY = "Impact, 'Arial Narrow', 'Arial Black', sans-serif";
const MONO = "Consolas, 'SF Mono', Menlo, monospace";

export function toEmailLanguage(value: unknown): EmailLanguage {
  return value === 'es' || value === 'ca' ? value : 'en';
}

export function buildLoginEmail({ to, link, expiryMinutes, language, appUrl }: LoginEmailOptions): LoginEmail {
  const copy = COPY[language];
  const expiry = copy.expiry(expiryMinutes);
  return {
    to,
    subject: copy.subject,
    text: `${copy.intro}\n\n${link}\n\n${expiry}\n${copy.ignore}`,
    html: renderHtml(copy, link, expiry, language, appUrl),
  };
}

/**
 * Table layout with inline styles: what Gmail, Outlook and mobile clients
 * render reliably. The animated banner moves everywhere; the CSS animations
 * are an extra for clients that keep `<style>` (Apple Mail, iOS) and are
 * dropped harmlessly elsewhere.
 */
function renderHtml(copy: LoginCopy, link: string, expiry: string, language: EmailLanguage, appUrl: string): string {
  return `<!doctype html>
<html lang="${language}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="dark">
<meta name="supported-color-schemes" content="dark">
<title>${copy.subject}</title>
<style>${ANIMATIONS}</style>
</head>
<body style="margin:0;padding:0;background:${COLORS.page};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${expiry}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${COLORS.page};">
<tr><td align="center" style="padding:32px 16px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:520px;">
<tr><td align="center" style="padding:0 0 20px;">
<img class="zr-logo" src="${appUrl}${LOGO_PATH}" width="72" height="72" alt="Zeroed" style="display:block;border:0;border-radius:16px;">
<div class="zr-title" style="margin-top:14px;color:${COLORS.title};font:900 34px/1 ${DISPLAY};letter-spacing:6px;">ZEROED</div>
</td></tr>
<tr><td class="zr-card" style="background:${COLORS.card};border:1px solid ${COLORS.border};border-left:3px solid ${COLORS.red};">
<img src="${appUrl}${BANNER_PATH}" width="520" alt="" style="display:block;width:100%;max-width:520px;height:auto;border:0;">
<div style="padding:22px 28px 24px;">
<div style="color:${COLORS.gold};font:700 11px/1.4 ${MONO};letter-spacing:3px;">${copy.kicker}</div>
<p style="margin:14px 0 22px;color:${COLORS.title};font:16px/1.5 ${SANS};">${copy.intro}</p>
<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
<td class="zr-button" style="background:${COLORS.gold};border-radius:2px;box-shadow:0 0 16px rgba(217,180,105,0.35);">
<a href="${link}" style="display:inline-block;padding:14px 28px;color:${COLORS.buttonText};font:700 15px/1 ${SANS};letter-spacing:1px;text-decoration:none;text-transform:uppercase;">${copy.action}</a>
</td></tr></table>
<p style="margin:22px 0 0;color:${COLORS.text};font:14px/1.5 ${SANS};">${expiry}</p>
<p style="margin:18px 0 6px;color:${COLORS.muted};font:12px/1.5 ${SANS};">${copy.fallback}</p>
<p style="margin:0;font:12px/1.5 ${MONO};word-break:break-all;"><a href="${link}" style="color:${COLORS.gold};">${link}</a></p>
</div>
</td></tr>
<tr><td align="center" style="padding:20px 8px 0;color:${COLORS.muted};font:12px/1.5 ${SANS};">${copy.ignore}</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
}
