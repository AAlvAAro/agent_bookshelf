#!/usr/bin/env bash
# Builds a review workspace in the current (empty) directory: usage scaffold.sh <hard|clean>
#   main         = origin/main of this repo (no plugin, no SPEC.md, no CLAUDE.md)
#   book-search  = main + the BOOK-101 implementation (commit 4246f9b, `impl` in evals/hard/expected.json),
#                  plus evals/hard/bugs.patch in the hard case. Checked out, clean tree.
# Same setup as evals/run-review-evals.mjs. Copies neither the plugin nor expected.json: the trees come
# from git archive and the patch is applied from its path in the repo.
set -euo pipefail
kind=$1
here=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
repo=$(git -C "$here" rev-parse --show-toplevel)
[ -z "$(ls -A .)" ] || { echo "scaffold: $(pwd) is not empty" >&2; exit 1; }
g() { git -c user.name=Dev -c user.email=dev@example.com -c commit.gpgsign=false "$@"; }

git -C "$repo" archive origin/main | tar -x
g init -q -b main
g add -A
g commit -qm "Initial commit"
g checkout -q -b book-search
git -C "$repo" archive 4246f9b src tests | tar -x
[ "$kind" = clean ] || g apply "$repo/ticket-to-merge/evals/hard/bugs.patch"
g add -A
g commit -qm "BOOK-101: search books by title or author"
[ -z "$(git status --porcelain)" ] || { echo "scaffold: tree not clean" >&2; exit 1; }
