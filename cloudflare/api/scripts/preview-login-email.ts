// Writes the login email as an HTML file to review its design in a browser:
//   npm run api:preview-email -- es out.html
// Images load from the local public/ folder, so unpublished assets show too.
// Runs through vite-node (shipped with Vitest) so it can import the API source.
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { buildLoginEmail, toEmailLanguage } from '../src/loginEmail';

const [language = 'es', output = 'login-email-preview.html'] = process.argv.slice(2);
const email = buildLoginEmail({
  to: 'player@example.com',
  link: 'https://www.zeroed.es/#login=PREVIEW_TOKEN',
  expiryMinutes: 15,
  language: toEmailLanguage(language),
  appUrl: pathToFileURL(resolve('public')).href,
});
writeFileSync(output, email.html);
console.log(`${email.subject} -> ${output}`);
