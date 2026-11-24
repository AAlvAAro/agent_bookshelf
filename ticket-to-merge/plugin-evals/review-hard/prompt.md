---
runs: 3
max_turns: 60
timeout_seconds: 900
allowed_tools: [Skill, Agent, Read, Glob, Grep, Bash]
---

Please review this branch's changes against `main` before I open the PR. They implement ticket BOOK-101, "Search books by title or author".

Acceptance criteria:
- A query matches title or author: partial, case-insensitive
- An empty query returns all books
- Input is trimmed; over 100 characters returns a validation error
- SQL is parameterised: no string-built queries
- Vitest covers each criterion; `npm run test:run` passes

Constraints: no schema changes, no new dependencies, never touch `bookshelf.db`, `seed.sql` or `.env`, keep the interface exactly as specified.

Report only real problems. Don't change any files. End your reply with the findings as one JSON array in a ```json block, each finding `{"file": ..., "line": <line in the new file>, "severity": "high|medium|low", "issue": ..., "evidence": ...}`, or `[]` if there are none.
