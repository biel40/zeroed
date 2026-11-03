import type { LoginEmail } from './LoginMailer';

/** The game's languages (`src/i18n`); unknown values fall back to English. */
export type EmailLanguage = 'en' | 'es' | 'ca';

interface LoginCopy {
  readonly subject: string;
  readonly intro: string;
  readonly action: string;
  readonly expiry: (minutes: number) => string;
  readonly ignore: string;
}

const COPY: Readonly<Record<EmailLanguage, LoginCopy>> = {
  en: {
    subject: 'Your Zeroed sign-in link',
    intro: 'Use this link to sign in to Zeroed:',
    action: 'Sign in',
    expiry: (minutes) => `It works once and expires in ${minutes} minutes.`,
    ignore: 'If you did not ask for it, you can ignore this email.',
  },
  es: {
    subject: 'Tu enlace para entrar en Zeroed',
    intro: 'Usa este enlace para iniciar sesión en Zeroed:',
    action: 'Iniciar sesión',
    expiry: (minutes) => `Solo funciona una vez y caduca en ${minutes} minutos.`,
    ignore: 'Si no lo has pedido, puedes ignorar este correo.',
  },
  ca: {
    subject: 'El teu enllaç per entrar a Zeroed',
    intro: 'Fes servir aquest enllaç per iniciar sessió a Zeroed:',
    action: 'Inicia sessió',
    expiry: (minutes) => `Només funciona una vegada i caduca en ${minutes} minuts.`,
    ignore: 'Si no l’has demanat, pots ignorar aquest correu.',
  },
};

export function toEmailLanguage(value: unknown): EmailLanguage {
  return value === 'es' || value === 'ca' ? value : 'en';
}

/** `link` is built by the API from its own configuration and a URL-safe token, so it needs no HTML escaping. */
export function buildLoginEmail(to: string, link: string, expiryMinutes: number, language: EmailLanguage): LoginEmail {
  const copy = COPY[language];
  const expiry = copy.expiry(expiryMinutes);
  return {
    to,
    subject: copy.subject,
    text: `${copy.intro}\n\n${link}\n\n${expiry}\n${copy.ignore}`,
    html: `<p>${copy.intro}</p><p><a href="${link}">${copy.action}</a></p><p>${expiry}<br>${copy.ignore}</p>`,
  };
}
