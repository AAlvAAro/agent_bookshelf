---
name: review-pr
description: Use whenever the user asks to review a branch, PR, diff or recent changes before merging. Reviews the diff against its base (default the merge-base with main) with read-only security and correctness specialists and a verifier that drops what it can't prove, and returns one JSON array of findings with file, line and evidence. Reports only; never edits. Usage - /ticket-to-merge:review-pr [base ref]
argument-hint: "[base ref or sha; default: merge-base with main]"
allowed-tools: Agent, Read, Grep, Glob, Bash(node *hooks/phase.mjs*), Bash(node *scripts/review-diff.mjs*), Bash(node *scripts/finalize-findings.mjs*)
---
Review the current branch. You orchestrate: you don't review code yourself and nothing in this skill edits a file. Don't ask the user anything.

## Running commands and agents
- One literal command per Bash call: no `&&`, `;`, pipes, `$(...)` or shell variables. Write shas and paths out in full. A chained command doesn't match the allowed rules and gets denied.
- Run every subagent in the foreground, never in the background, and wait for its result.
- A permission denial never ends the task: resend the work command by command, each as its own literal call.

## 1. Prepare
1. `node "${CLAUDE_PLUGIN_ROOT}/hooks/phase.mjs" review` (makes `src/` and `tests/` read-only while the review runs).
2. `node "${CLAUDE_PLUGIN_ROOT}/scripts/review-diff.mjs" $ARGUMENTS` and read its JSON: `diffFile`, `files`, `commits`, `branch`. If it returns `error`, set the phase `off`, report the error and stop. If `changedLines` is 0, report `[]` and stop.
3. Pick the spec, first match wins:
   - `SPEC.md` in the repo root;
   - a ticket id in the branch name or commit messages that has a file in `${CLAUDE_PLUGIN_ROOT}/tickets/<id>.md`;
   - if the diff touches book search and nothing above matched, `${CLAUDE_PLUGIN_ROOT}/tickets/BOOK-101.md`;
   - otherwise none: the reviewers use `CLAUDE.md`, the README and the tests as the statement of intent.

## 2. Specialists (in parallel)
Call **ticket-to-merge:review-security** and **ticket-to-merge:review-correctness** in one message so they run at the same time. Each brief, under 120 words:
```
Task: review this diff and return JSON findings as your agent file specifies.
Diff file: <diffFile> (annotated with new-file line numbers). Changed files: <paths>.
Spec: <spec path, or "none: use CLAUDE.md, README and tests">. Conventions: CLAUDE.md (if present).
Scope: only lines the diff added or changed. Return only the JSON array.
```

## 3. Verify
If both returned `[]`, skip to step 4. Otherwise call **ticket-to-merge:review-verifier** once with every candidate (tag each with `"reviewer"`), the diff file path and the spec path.

## 4. Report
1. `node "${CLAUDE_PLUGIN_ROOT}/hooks/phase.mjs" off` (when called from ship-ticket, it sets the next phase itself).
2. Finalize, always as the last step. If the verifier ran: `node "${CLAUDE_PLUGIN_ROOT}/scripts/finalize-findings.mjs" --spec <spec used>`. If you skipped it: the same command with `--none` added. The script corrects line numbers from the quoted evidence, drops findings far from any change, holds back findings the verifier marked not proven, and saves the result to `.ticket-to-merge/findings.json`. If it exits with an error, print the verifier's `confirmed` list in the same shape yourself.
3. The user can't see tool output, so your reply must contain the report: copy the script's whole stdout into your reply word for word, starting with its `Review of` line and including its ```json block. Don't summarize it or point to it ("the report above"). That JSON block must be the only fenced block in your reply.
4. A row per agent call (agent, model, tokens, tool uses, duration) plus a Total row, taken from the agent results.
