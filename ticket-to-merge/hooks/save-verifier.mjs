#!/usr/bin/env node
// SubagentStop hook (matcher ^ticket-to-merge:review-verifier$): saves the verifier's final message, the
// verified findings, to .ticket-to-merge/verifier.json. finalize-findings.mjs reads that file, so the
// orchestrator never re-types the findings. It never blocks: if it fails, finalize-findings reports the
// missing file and the orchestrator prints the verifier's list itself.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { readInput, projectRoot } from './lib.mjs';

/** Last assistant text in a transcript (JSONL), for runs whose payload has no last_assistant_message. */
function lastFromTranscript(file) {
  try {
    const rows = readFileSync(file, 'utf8').trim().split('\n').map((l) => { try { return JSON.parse(l); } catch { return null; } });
    for (const r of rows.reverse()) {
      const content = r?.message?.role === 'assistant' ? r.message.content : null;
      const text = Array.isArray(content) ? content.filter((c) => c.type === 'text').map((c) => c.text).join('\n') : content;
      if (text) return text;
    }
  } catch {}
  return '';
}

try {
  const input = readInput();
  if (String(input.agent_type ?? '').endsWith('review-verifier')) {
    const text = input.last_assistant_message || lastFromTranscript(input.agent_transcript_path);
    if (text) {
      const dir = join(projectRoot(input), '.ticket-to-merge');
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, 'verifier.json'), String(text));
    }
  }
} catch {}
process.exit(0);
