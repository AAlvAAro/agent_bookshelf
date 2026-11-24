#!/usr/bin/env bash
# Launch /ticket-to-merge:review-pr on Sonnet with review-pr's allowed-tools granted at startup.
#   review.sh [-p] [--dry-run] [base] [-- <extra claude args>]
#   -p         headless: adds -p --output-format json
#   --dry-run  print the command and exit 0
#   CLAUDE_BIN binary to run (default: claude)
# Exit: 2 usage error, 3 RULES out of sync with the skill's allowed-tools, else claude's code.
set -euo pipefail
NAME=review.sh
. "$(dirname "${BASH_SOURCE[0]}")/launch-lib.sh"
PLUGIN_DIR=$(plugin_dir "${BASH_SOURCE[0]}")

# Must match allowed-tools in skills/review-pr/SKILL.md (checked on every run).
RULES=(
  "Agent" "Read" "Grep" "Glob"
  "Bash(node *hooks/phase.mjs*)"
  "Bash(node *scripts/review-diff.mjs*)"
  "Bash(node *scripts/finalize-findings.mjs*)"
)
SKILLS=(review-pr)

print=0 dry=0 base="" extra=()
while [ $# -gt 0 ]; do
  case $1 in
    -p) print=1 ;;
    --dry-run) dry=1 ;;
    -h|--help) sed -n '3,7p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    --) shift; extra=("$@"); break ;;
    -*) die "unknown option: $1" ;;
    *) [ -z "$base" ] || die "only one base allowed (got '$base' and '$1')"; base=$1 ;;
  esac
  shift
done

check_rules
prompt=/ticket-to-merge:review-pr
[ -z "$base" ] || prompt+=" $base"
launch "$print" "$dry" "$prompt" ${extra[@]+"${extra[@]}"}
