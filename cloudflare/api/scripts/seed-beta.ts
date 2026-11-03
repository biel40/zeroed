// Prints the beta grant SQL for a text file with one tester email per line:
//   npm run api:seed-beta -- testers.txt > seed.sql
// Runs through vite-node (shipped with Vitest) so it can import the API source.
import { readFileSync } from 'node:fs';
import { buildBetaSeedSql } from '../src/betaSeed';

const file = process.argv[2];
if (!file) {
  console.error('Usage: npm run api:seed-beta -- <emails.txt>');
  process.exit(1);
}

const emails = readFileSync(file, 'utf8').split(/\r?\n/).filter((line) => line.trim() !== '');
console.log(buildBetaSeedSql(emails, Date.now()));
