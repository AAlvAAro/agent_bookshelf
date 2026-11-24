#!/usr/bin/env bash
# Launch /ticket-to-merge:ship-ticket on Sonnet with ship-ticket's and review-pr's allowed-tools granted
# at startup (ship-ticket runs the review-pr steps itself).
#   ship.sh [-p] [--dry-run] [ticket id] [-- <extra claude args>]
#   -p         headless: adds -p --output-format json
#   --dry-run  print the command and exit 0
#   CLAUDE_BIN binary to run (default: claude)
# Exit: 2 usage error, 3 RULES out of sync with the skills' allowed-tools, else claude's code.
set -euo pipefail
NAME=ship.sh
. "$(dirname "${BASH_SOURCE[0]}")/launch-lib.sh"
PLUGIN_DIR=$(plugin_dir "${BASH_SOURCE[0]}")

# Must match the union of allowed-tools in skills/ship-ticket/SKILL.md and skills/review-pr/SKILL.md.
RULES=(
  "Agent" "Read" "Grep" "Glob"
  "Bash(node *hooks/phase.mjs*)"
  "Bash(node *scripts/check-tests.mjs*)"
  "Bash(node *scripts/mutate.mjs*)"
  "Bash(node *scripts/review-diff.mjs*)"
  "Bash(node *scripts/finalize-findings.mjs*)"
  "Bash(git status *)" "Bash(git rev-parse *)" "Bash(git branch *)" "Bash(git diff *)"
  "Bash(git add *)" "Bash(git commit *)" "Bash(git log *)"
  "Bash(npm run *)"
)
SKILLS=(ship-ticket review-pr)

print=0 dry=0 ticket="" extra=()
while [ $# -gt 0 ]; do
  case $1 in
    -p) print=1 ;;
    --dry-run) dry=1 ;;
    -h|--help) sed -n '4,8p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    --) shift; extra=("$@"); break ;;
    -*) die "unknown option: $1" ;;
    *) [ -z "$ticket" ] || die "only one ticket id allowed (got '$ticket' and '$1')"; ticket=$1 ;;
  esac
  shift
done

check_rules
prompt=/ticket-to-merge:ship-ticket
[ -z "$ticket" ] || prompt+=" $ticket"
launch "$print" "$dry" "$prompt" ${extra[@]+"${extra[@]}"}
