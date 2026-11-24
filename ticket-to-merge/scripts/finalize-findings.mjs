#!/usr/bin/env node
// Last step of review-pr: deterministic checks a prompt can only ask for. Node built-ins only.
//   node finalize-findings.mjs [--spec <label>]   reads .ticket-to-merge/verifier.json
//   node finalize-findings.mjs --none [--spec ..]  the verifier was skipped (no candidates): publish []
// 1. Line: a finding whose line isn't next to a change, or doesn't hold the quoted evidence, is moved to
//    the line where that evidence is (nearest one to a change).
// 2. Scope: in a file the branch changed, a finding more than SCOPE lines from any change is about code
//    this branch didn't write: dropped. Findings in files the branch didn't change are left as they are.
// 3. Proof: findings the verifier marked "proven": false are not published; they go to unconfirmed.json.
// Inputs: .ticket-to-merge/review.json (written by review-diff.mjs) and .ticket-to-merge/verifier.json
// (the verifier's final message, saved by the SubagentStop hook). Writes findings.json and
// unconfirmed.json next to them and prints the report section, with the only JSON block, to stdout.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const NEAR = 3;
export const SCOPE = 8;
const RANK = { high: 0, medium: 1, low: 2 };
const norm = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();

/** The verifier's message → { confirmed, dropped }, or null if it holds no JSON. */
export function parseVerifier(text) {
  const tries = [text];
  const fence = [...String(text).matchAll(/```(?:json)?\s*([\s\S]*?)```/g)].pop();
  if (fence) tries.push(fence[1]);
  for (const [open, close] of [['{', '}'], ['[', ']']]) {
    const a = String(text).indexOf(open);
    const b = String(text).lastIndexOf(close);
    if (a >= 0 && b > a) tries.push(String(text).slice(a, b + 1));
  }
  for (const t of tries) {
    try {
      const v = JSON.parse(t);
      if (Array.isArray(v)) return { confirmed: v, dropped: [] };
      if (v && Array.isArray(v.confirmed)) return { confirmed: v.confirmed, dropped: Array.isArray(v.dropped) ? v.dropped : [] };
    } catch {}
  }
  return null;
}

/** Code the finding quotes: `backticked` spans first (longest first), then the evidence itself. */
function quotes(f) {
  const ticks = [...`${f.evidence ?? ''} ${f.issue ?? ''}`.matchAll(/`([^`\n]{4,})`/g)].map((m) => norm(m[1]));
  const whole = norm(String(f.evidence ?? '').replace(/^[`'"]+|[`'"]+$/g, ''));
  return [...new Set([...ticks.sort((a, b) => b.length - a.length), ...(whole.length >= 4 ? [whole] : [])])];
}

export function finalize(findings, { changed = {}, readFile }) {
  const published = [];
  const unconfirmed = [];
  const moved = [];
  const outOfScope = [];
  for (const raw of findings) {
    const { proven, ...f } = { ...raw, file: String(raw.file ?? '').replace(/^\.\//, ''), line: Number(raw.line) || 1 };
    const changedHere = changed[f.file] || [];
    const text = changedHere.length ? readFile(f.file) : null;
    if (text != null) {
      const lines = text.split('\n').map(norm);
      const near = (n, reach) => changedHere.some((c) => Math.abs(c - n) <= reach);
      const qs = quotes(f);
      const holds = (n) => !qs.length || qs.some((q) => (lines[n - 1] || '').includes(q));
      if (!(f.line <= lines.length && near(f.line, NEAR) && holds(f.line))) {
        for (const q of qs) {
          const hits = lines.flatMap((l, i) => (l.includes(q) ? [i + 1] : [])).filter((n) => near(n, SCOPE));
          if (!hits.length) continue;
          const best = hits.reduce((a, b) => (Math.abs(b - f.line) < Math.abs(a - f.line) ? b : a));
          if (best !== f.line) moved.push(`${f.file}: ${f.line} -> ${best}`);
          f.line = best;
          break;
        }
      }
      if (!near(f.line, SCOPE)) {
        outOfScope.push(f);
        continue;
      }
    }
    (proven === false ? unconfirmed : published).push(f);
  }
  const order = (a, b) => (RANK[a.severity] ?? 3) - (RANK[b.severity] ?? 3) || a.file.localeCompare(b.file) || a.line - b.line;
  return { published: published.sort(order), unconfirmed: unconfirmed.sort(order), moved, outOfScope };
}

function main(argv) {
  const root = process.env.CLAUDE_PROJECT_DIR || process.cwd();
  const dir = join(root, '.ticket-to-merge');
  const at = argv.indexOf('--spec');
  const spec = at >= 0 ? argv[at + 1] : 'none';
  let review = {};
  try { review = JSON.parse(readFileSync(join(dir, 'review.json'), 'utf8')); } catch {}

  let verdict = { confirmed: [], dropped: [] };
  if (!argv.includes('--none')) {
    const file = join(dir, 'verifier.json');
    verdict = existsSync(file) ? parseVerifier(readFileSync(file, 'utf8')) : null;
    if (!verdict) {
      console.error(`finalize-findings: ${file} is missing or holds no JSON findings. Print the verifier's confirmed list yourself.`);
      process.exit(1);
    }
  }
  const readFile = (f) => { try { return readFileSync(join(root, f), 'utf8'); } catch { return null; } };
  const r = finalize(verdict.confirmed, { changed: review.changed || {}, readFile });
  writeFileSync(join(dir, 'findings.json'), JSON.stringify(r.published, null, 2) + '\n');
  writeFileSync(join(dir, 'unconfirmed.json'), JSON.stringify(r.unconfirmed, null, 2) + '\n');

  const count = (s) => r.published.filter((f) => f.severity === s).length;
  const out = [
    `Review of \`${review.branch || 'HEAD'}\` against \`${review.base || '?'}\` · ${review.files ?? '?'} files · spec: ${spec}`,
    '',
    '```json',
    JSON.stringify(r.published, null, 2),
    '```',
    '',
    `Findings: ${r.published.length} confirmed (${count('high')} high, ${count('medium')} medium, ${count('low')} low) · ${verdict.dropped.length} dropped by the verifier · ${r.unconfirmed.length} not proven (in .ticket-to-merge/unconfirmed.json) · ${r.outOfScope.length} out of scope`,
    ...verdict.dropped.map((d) => `- dropped ${d.file}:${d.line} ${d.issue}: ${d.reason}`),
    ...r.unconfirmed.map((f) => `- not proven ${f.file}:${f.line} ${f.issue}`),
    ...r.outOfScope.map((f) => `- out of scope (more than ${SCOPE} lines from a change) ${f.file}:${f.line} ${f.issue}`),
    ...r.moved.map((m) => `- line corrected ${m}`),
  ];
  console.log(out.join('\n'));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main(process.argv.slice(2));
