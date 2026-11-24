#!/usr/bin/env node
// Layer 2 · tamper check. SessionStart: record sha256 of every protected file (and a backup copy).
// PostToolUse: compare again; anything changed is restored and reported back to Claude (exit 2).
// This catches what layer 1's string matching can't see (a script, a symlink, an obfuscated path).
import { readInput, projectRoot, snapshot, verifyAndRestore } from './lib.mjs';

const input = readInput();
const root = projectRoot(input);

if (input.hook_event_name === 'SessionStart') {
  snapshot(root);
  process.exit(0);
}

const problems = verifyAndRestore(root);
if (problems.length) {
  process.stderr.write(
    `GUARDRAIL: a protected file changed during the last tool call.\n- ${problems.join('\n- ')}\n` +
      `Don't touch bookshelf.db*, src/db/seed.sql or .env. Continue the task without them.\n`
  );
  process.exit(2);
}
process.exit(0);
