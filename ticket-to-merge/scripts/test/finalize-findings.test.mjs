// Tests for scripts/finalize-findings.mjs. Run: node --test ticket-to-merge/scripts/test/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { finalize, parseVerifier } from '../finalize-findings.mjs';

const SCRIPT = join(dirname(dirname(fileURLToPath(import.meta.url))), 'finalize-findings.mjs');

// 40-line file; the branch changed lines 10-12.
const FILE = Array.from({ length: 40 }, (_, i) => `line ${i + 1}`);
FILE[10] = "  const rows = all(`SELECT * FROM books WHERE title LIKE '%${q}%'`);";
const files = { 'src/models/book.ts': FILE.join('\n') };
const opts = { changed: { 'src/models/book.ts': [10, 11, 12] }, readFile: (f) => files[f] ?? null };
const finding = (over) => ({ file: 'src/models/book.ts', line: 11, severity: 'high', issue: 'SQL built from input', evidence: "`LIKE '%${q}%'`", reviewer: 'security', ...over });

test('corrects a line number by finding the quoted evidence in the file', () => {
  const r = finalize([finding({ line: 30 })], opts);
  assert.equal(r.published.length, 1);
  assert.equal(r.published[0].line, 11);
  assert.deepEqual(r.moved, ['src/models/book.ts: 30 -> 11']);
});

test('keeps a correct line as it is', () => {
  const r = finalize([finding()], opts);
  assert.equal(r.published[0].line, 11);
  assert.deepEqual(r.moved, []);
});

test('drops a finding more than N lines from any change', () => {
  const r = finalize([finding({ line: 35, evidence: 'line 35' })], opts);
  assert.equal(r.published.length, 0);
  assert.equal(r.outOfScope.length, 1);
});

test('keeps a finding within N lines of a change', () => {
  const r = finalize([finding({ line: 18, evidence: 'line 18' })], opts);
  assert.equal(r.published.length, 1);
});

test('keeps findings in files the branch did not change (left to the verifier)', () => {
  const r = finalize([finding({ file: 'tests/search.test.ts', line: 3, evidence: 'no test for AC3' })], opts);
  assert.equal(r.published.length, 1);
});

test('does not publish findings marked as not proven', () => {
  const r = finalize([finding({ proven: false }), finding({ line: 12, issue: 'other', proven: true })], opts);
  assert.equal(r.published.length, 1);
  assert.equal(r.unconfirmed.length, 1);
  assert.equal(r.unconfirmed[0].issue, 'SQL built from input');
  assert.equal('proven' in r.published[0], false);
});

test('sorts by severity, then file and line', () => {
  const r = finalize([finding({ severity: 'low', line: 10, evidence: 'x' }), finding({ severity: 'high', line: 12, evidence: 'y' })], opts);
  assert.deepEqual(r.published.map((f) => f.severity), ['high', 'low']);
});

test('parses the verifier object, a bare array, and JSON wrapped in prose or a fence', () => {
  const obj = { confirmed: [finding()], dropped: [{ file: 'a', line: 1, issue: 'x', reason: 'y' }] };
  assert.equal(parseVerifier(JSON.stringify(obj)).confirmed.length, 1);
  assert.equal(parseVerifier(JSON.stringify(obj)).dropped.length, 1);
  assert.equal(parseVerifier(JSON.stringify([finding()])).confirmed.length, 1);
  assert.equal(parseVerifier('Here:\n```json\n' + JSON.stringify(obj) + '\n```\n').confirmed.length, 1);
  assert.equal(parseVerifier('not json'), null);
});

function workspace(verifier) {
  const root = mkdtempSync(join(tmpdir(), 'ttm-final-'));
  mkdirSync(join(root, 'src/models'), { recursive: true });
  mkdirSync(join(root, '.ticket-to-merge'));
  writeFileSync(join(root, 'src/models/book.ts'), FILE.join('\n'));
  writeFileSync(join(root, '.ticket-to-merge/review.json'), JSON.stringify({ base: 'abc123', branch: 'feat/x', files: 1, changed: opts.changed }));
  if (verifier !== undefined) writeFileSync(join(root, '.ticket-to-merge/verifier.json'), verifier);
  return root;
}
const cli = (root, ...args) => spawnSync('node', [SCRIPT, ...args], { cwd: root, env: { ...process.env, CLAUDE_PROJECT_DIR: root }, encoding: 'utf8' });

test('CLI prints the report with one JSON block and saves findings and unconfirmed', () => {
  const root = workspace(JSON.stringify({ confirmed: [finding({ line: 30 }), finding({ line: 12, issue: 'maybe', proven: false })], dropped: [] }));
  const r = cli(root, '--spec', 'SPEC.md');
  assert.equal(r.status, 0, r.stderr);
  const blocks = [...r.stdout.matchAll(/```json\s*([\s\S]*?)```/g)];
  assert.equal(blocks.length, 1);
  const published = JSON.parse(blocks[0][1]);
  assert.equal(published.length, 1);
  assert.equal(published[0].line, 11);
  assert.match(r.stdout, /Review of `feat\/x` against `abc123` · 1 files · spec: SPEC.md/);
  assert.equal(JSON.parse(readFileSync(join(root, '.ticket-to-merge/unconfirmed.json'), 'utf8')).length, 1);
  assert.equal(JSON.parse(readFileSync(join(root, '.ticket-to-merge/findings.json'), 'utf8')).length, 1);
});

test('CLI fails when the verifier output is missing, so an empty review is never published by accident', () => {
  const r = cli(workspace());
  assert.equal(r.status, 1);
  assert.match(r.stderr, /verifier\.json/);
});

test('CLI --none publishes [] when the verifier was skipped', () => {
  const root = workspace();
  const r = cli(root, '--none');
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /```json\s*\[\]\s*```/);
  assert.ok(existsSync(join(root, '.ticket-to-merge/findings.json')));
});
