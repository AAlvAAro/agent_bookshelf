#!/usr/bin/env node
// SubagentStop hook: saves the verifier's final message, the
// verified findings, to .ticket-to-merge/verifier.json. finalize-findings.mjs reads that file, so the
// orchestrator never re-types the findings. It never blocks: if it fails, finalize-findings reports the
// missing file and the orchestrator prints the verifier's list itself.
// No matcher in hooks.json: on Claude Code 2.1.331 a SubagentStop entry with a matcher never ran (tried
// ^ticket-to-merge:review-verifier$ and review-verifier), so the agent_type check below does the filtering.
// The hook also fires a second time per verifier, without last_assistant_message: the transcript
// fallback only fills a missing file and never overwrites the first save.
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { readInput, projectRoot } from './lib.mjs';

/** The agent's final report from its transcript (JSONL): a SubagentHandback message, or the last
 *  assistant text. Some runs deliver the report through SubagentHandback, and then the payload has no
 *  last_assistant_message. The transcript can lag the hook a little, so it retries for up to ~3 s. */
export function reportFromTranscript(file, tries = 6) {
  for (let i = 0; i < tries; i++) {
    try {
      const rows = readFileSync(file, 'utf8').trim().split('\n').map((l) => { try { return JSON.parse(l); } catch { return null; } });
      for (const r of rows.reverse()) {
        if (r?.message?.role !== 'assistant') continue;
        const content = Array.isArray(r.message.content) ? r.message.content : [{ type: 'text', text: r.message.content }];
        const handback = content.find((c) => c.type === 'tool_use' && c.name === 'SubagentHandback');
        if (handback?.input?.message) return String(handback.input.message);
        const text = content.filter((c) => c.type === 'text').map((c) => c.text).join('\n');
        if (text.trim()) return text;
      }
    } catch {}
    if (i < tries - 1) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 500);
  }
  return '';
}

try {
  const input = readInput();
  if (String(input.agent_type ?? '').endsWith('review-verifier')) {
    const dir = join(projectRoot(input), '.ticket-to-merge');
    const file = join(dir, 'verifier.json');
    const text = input.last_assistant_message || (existsSync(file) ? '' : reportFromTranscript(input.agent_transcript_path));
    if (text) {
      mkdirSync(dir, { recursive: true });
      writeFileSync(file, String(text));
    }
  }
} catch {}
process.exit(0);
