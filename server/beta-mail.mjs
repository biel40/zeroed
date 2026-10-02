import nodemailer from 'nodemailer';

export const BETA_INBOX = 'biel40aws@gmail.com';

export async function sendBetaEmail(action, email, text) {
  const password = process.env.BETA_GMAIL_APP_PASSWORD?.replace(/\s/g, '');
  if (!password) throw new Error('Missing Gmail app password');
  const transport = nodemailer.createTransport({
    host: 'smtp.gmail.com', port: 465, secure: true,
    auth: { user: BETA_INBOX, pass: password },
    connectionTimeout: 8000, greetingTimeout: 8000, socketTimeout: 15000,
  });
  const to = action === 'request' ? BETA_INBOX : email;
  const result = await transport.sendMail({
    from: { name: 'Zeroed Beta', address: BETA_INBOX }, to,
    replyTo: action === 'request' ? email : BETA_INBOX,
    subject: action === 'request' ? 'Zeroed: solicitud de acceso a la beta' : 'Tu acceso a la beta de Zeroed',
    text, disableFileAccess: true, disableUrlAccess: true,
  });
  if (!result.accepted?.includes(to)) throw new Error('Recipient not accepted');
}
