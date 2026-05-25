#!/usr/bin/env node
/**
 * Regenerate CHANGELOG.md with git-cliff and fail if it differs from the committed file.
 */
import { execSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';

const committed = 'backend/CHANGELOG.md';
const generated = 'backend/CHANGELOG.md.check';

if (!existsSync(committed)) {
  console.error(`Missing ${committed}. Run: npm run changelog`);
  process.exit(1);
}

try {
  execSync(`git-cliff --config cliff.toml -o ${generated}`, { stdio: 'inherit' });
} catch {
  console.error(
    'git-cliff is not installed. Install: https://git-cliff.org/docs/installation/\n' +
      '  cargo install git-cliff\n' +
      '  or use the GitHub Action (changelog workflow) on CI.',
  );
  process.exit(1);
}

const a = readFileSync(committed, 'utf8').trimEnd();
const b = readFileSync(generated, 'utf8').trimEnd();

if (a !== b) {
  console.error(
    '\nCHANGELOG.md is out of date. Regenerate and commit:\n  npm run changelog\n',
  );
  process.exit(1);
}

console.log('CHANGELOG.md matches git-cliff output.');
