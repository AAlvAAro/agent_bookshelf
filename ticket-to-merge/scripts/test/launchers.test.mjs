// Tests for scripts/ship.sh and scripts/review.sh. Run: node --test ticket-to-merge/scripts/test/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, cpSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const PLUGIN = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const run = (plugin, script, ...args) => spawnSync('bash', [join(plugin, 'scripts', script), ...args], { encoding: 'utf8' });

for (const [script, prompt] of [['review.sh', '/ticket-to-merge:review-pr main'], ['ship.sh', '/ticket-to-merge:ship-ticket BOOK-101']]) {
  test(`${script} --dry-run starts claude on sonnet with the skill rules and no ScheduleWakeup`, () => {
    const r = run(PLUGIN, script, '--dry-run', prompt.split(' ')[1]);
    assert.equal(r.status, 0, r.stderr);
    const args = [...r.stderr.matchAll(/^  '(.*)'$/gm)].map((m) => m[1]);
    assert.deepEqual(args.slice(1, 3), ['--model', 'sonnet']);
    assert.equal(args[args.indexOf('--disallowedTools') + 1], 'ScheduleWakeup');
    assert.ok(args.includes('Bash(node *scripts/review-diff.mjs*)'));
    assert.ok(!args.includes('-p'));
    assert.deepEqual(args.slice(-2), ['--', prompt]);
  });

  test(`${script} -p adds headless JSON output`, () => {
    const r = run(PLUGIN, script, '-p', '--dry-run');
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stderr, /'-p'\n  '--output-format'\n  'json'/);
  });

  test(`${script} fails when its rules differ from the skill's allowed-tools`, () => {
    const copy = mkdtempSync(join(tmpdir(), 'ttm-launch-'));
    cpSync(PLUGIN, copy, { recursive: true, filter: (p) => !p.includes('/evals/') });
    const skill = join(copy, 'skills/review-pr/SKILL.md');
    writeFileSync(skill, readFileSync(skill, 'utf8').replace(/^(allowed-tools: .*)$/m, '$1, Bash(rm *)'));
    const r = run(copy, script, '--dry-run');
    assert.equal(r.status, 3);
    assert.match(r.stderr, /out of sync/);
    assert.match(r.stderr, /Bash\(rm \*\)/);
  });
}

test('unknown options are a usage error', () => {
  assert.equal(run(PLUGIN, 'review.sh', '--nope').status, 2);
});
