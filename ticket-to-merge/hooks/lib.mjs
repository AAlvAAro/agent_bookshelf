// Shared helpers for the ticket-to-merge guardrail hooks. Node built-ins only.
import { readFileSync, existsSync, mkdirSync, writeFileSync, copyFileSync, chmodSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, basename, resolve, relative, isAbsolute, sep } from 'node:path';
import { execFileSync } from 'node:child_process';

// Files no agent may touch, relative to the project root.
// `secret: true` = never read either, and never copied into the backup.
export const PROTECTED = [
  { path: 'bookshelf.db' },
  { path: 'bookshelf.db-wal' },
  { path: 'bookshelf.db-shm' },
  { path: 'bookshelf.db-journal' },
  { path: 'src/db/seed.sql' },
  { path: '.env', secret: true },
];

// Basename patterns, so a path given any way (absolute, ./, ../x/..) still matches.
const DB_RE = /^bookshelf\.db(-wal|-shm|-journal)?$/;
const SEED_RE = /^seed\.sql$/;
const ENV_RE = /^\.env(\..+)?$/;

export function readInput() {
  try {
    return JSON.parse(readFileSync(0, 'utf8') || '{}');
  } catch {
    return {};
  }
}

export function block(reason) {
  process.stderr.write(`BLOCKED by ticket-to-merge guardrail: ${reason}\n`);
  process.exit(2);
}

export function projectRoot(input) {
  return process.env.CLAUDE_PROJECT_DIR || input.cwd || process.cwd();
}

/** Is this file path one of the protected files? Returns the kind or null. */
export function protectedKind(filePath, { forRead = false } = {}) {
  if (!filePath) return null;
  const name = basename(String(filePath));
  if (ENV_RE.test(name) && name !== '.env.example') return 'secret (.env)';
  if (forRead) return null; // reading the DB or the seed is harmless
  if (DB_RE.test(name)) return 'database (bookshelf.db)';
  if (SEED_RE.test(name)) return 'seed data (seed.sql)';
  return null;
}

/** Directories that contain a protected file: deleting/resetting them is a bypass. */
export function isAncestorOfProtected(arg, root, cwd) {
  if (!arg || arg.startsWith('-')) return false;
  const abs = isAbsolute(arg) ? arg : resolve(cwd || root, arg);
  return PROTECTED.some(({ path }) => {
    const target = join(root, path);
    const rel = relative(abs, target);
    return rel !== '' && !rel.startsWith('..') && !isAbsolute(rel);
  });
}

// ---- integrity baseline (layer 2) ----
// Lives in .git/ticket-to-merge/, outside the working tree, so it's never diffed or committed.
function stateDir(root) {
  let gitDir = join(root, '.git');
  try {
    gitDir = execFileSync('git', ['rev-parse', '--absolute-git-dir'], { cwd: root, encoding: 'utf8' }).trim();
  } catch {}
  return join(gitDir, 'ticket-to-merge');
}

const hash = (file) => (existsSync(file) ? createHash('sha256').update(readFileSync(file)).digest('hex') : null);

export function snapshot(root) {
  const dir = stateDir(root);
  mkdirSync(join(dir, 'backup'), { recursive: true });
  const hashes = {};
  for (const { path, secret } of PROTECTED) {
    const abs = join(root, path);
    hashes[path] = hash(abs);
    if (hashes[path] && !secret) {
      const dest = join(dir, 'backup', path.split('/').join('__'));
      copyFileSync(abs, dest);
      chmodSync(dest, 0o600);
    }
  }
  writeFileSync(join(dir, 'baseline.json'), JSON.stringify(hashes, null, 2));
  return hashes;
}

export function ensureBaseline(root) {
  if (!existsSync(join(stateDir(root), 'baseline.json'))) snapshot(root);
}

/** Compare protected files with the baseline; restore what we can. Returns a list of problems. */
export function verifyAndRestore(root) {
  const dir = stateDir(root);
  const file = join(dir, 'baseline.json');
  if (!existsSync(file)) {
    snapshot(root);
    return [];
  }
  const baseline = JSON.parse(readFileSync(file, 'utf8'));
  const problems = [];
  for (const { path, secret } of PROTECTED) {
    const abs = join(root, path);
    const now = hash(abs);
    if (now === baseline[path]) continue;
    const backup = join(dir, 'backup', path.split('/').join('__'));
    if (baseline[path] && !secret && existsSync(backup)) {
      copyFileSync(backup, abs);
      problems.push(`${path} was modified or deleted; restored from the session-start copy`);
    } else if (!baseline[path] && !secret) {
      // didn't exist at session start (e.g. bookshelf.db created by running the app): remove it
      try { execFileSync('rm', ['-f', abs]); } catch {}
      problems.push(`${path} was created; removed it`);
    } else {
      problems.push(`${path} changed and can't be restored automatically (secret); tell the human`);
    }
  }
  return problems;
}

export { sep };
