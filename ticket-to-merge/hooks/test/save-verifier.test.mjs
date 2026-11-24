// Run: node --test ticket-to-merge/hooks/test/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, existsSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HOOK = join(dirname(dirname(fileURLToPath(import.meta.url))), 'save-verifier.mjs');
const run = (root, payload) => spawnSync('node', [HOOK], { input: JSON.stringify({ cwd: root, ...payload }), env: { ...process.env, CLAUDE_PROJECT_DIR: root }, encoding: 'utf8' });
const MSG = '{"confirmed": [], "dropped": []}';

test('saves the verifier final message to .ticket-to-merge/verifier.json', () => {
  const root = mkdtempSync(join(tmpdir(), 'ttm-save-'));
  const r = run(root, { hook_event_name: 'SubagentStop', agent_type: 'ticket-to-merge:review-verifier', last_assistant_message: MSG });
  assert.equal(r.status, 0);
  assert.equal(readFileSync(join(root, '.ticket-to-merge/verifier.json'), 'utf8'), MSG);
});

test('falls back to the last assistant text in the agent transcript', () => {
  const root = mkdtempSync(join(tmpdir(), 'ttm-save-'));
  const t = join(root, 't.jsonl');
  writeFileSync(t, [{ message: { role: 'assistant', content: [{ type: 'text', text: 'old' }] } }, { message: { role: 'assistant', content: [{ type: 'text', text: MSG }] } }].map((x) => JSON.stringify(x)).join('\n'));
  run(root, { hook_event_name: 'SubagentStop', agent_type: 'ticket-to-merge:review-verifier', agent_transcript_path: t });
  assert.equal(readFileSync(join(root, '.ticket-to-merge/verifier.json'), 'utf8'), MSG);
});

test('ignores other agents and never blocks', () => {
  const root = mkdtempSync(join(tmpdir(), 'ttm-save-'));
  const r = run(root, { hook_event_name: 'SubagentStop', agent_type: 'ticket-to-merge:review-security', last_assistant_message: '[]' });
  assert.equal(r.status, 0);
  assert.equal(existsSync(join(root, '.ticket-to-merge/verifier.json')), false);
});
