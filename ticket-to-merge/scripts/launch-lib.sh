# Shared by ship.sh and review.sh (sourced, not run). Bash 3.2+ (macOS default).
# Starts claude with the model and permissions fixed at startup: a skill's `allowed-tools` only lasts
# until the next message, and a background agent's completion notice counts as one, so a headless run
# could stop at a permission prompt or switch model mid-review.

die() { echo "$NAME: $1" >&2; exit "${2:-2}"; }

# Plugin dir = the folder above this script, following symlinks.
plugin_dir() {
  local src=$1 dir
  while [ -L "$src" ]; do
    dir=$(cd -P "$(dirname "$src")" && pwd)
    src=$(readlink "$src")
    case $src in /*) ;; *) src=$dir/$src ;; esac
  done
  cd -P "$(dirname "$src")/.." && pwd
}

# Entries of the allowed-tools line of each skill given, one per line, sorted and unique.
skill_rules() {
  local s f
  for s in "$@"; do
    f=$PLUGIN_DIR/skills/$s/SKILL.md
    [ -f "$f" ] || die "missing $f" 3
    sed -n 's/^allowed-tools:[[:space:]]*//p' "$f" | head -n 1 | grep -oE '[A-Za-z_]+(\([^)]*\))?' || true
  done | sort -u
}

# Fails (exit 3) when RULES and the skills' allowed-tools differ.
check_rules() {
  local drift
  if ! drift=$(diff <(printf '%s\n' "${RULES[@]}" | sort -u) <(skill_rules "${SKILLS[@]}")); then
    printf '%s: RULES out of sync with allowed-tools in %s (< script, > skill):\n%s\n' "$NAME" "${SKILLS[*]}" "$drift" >&2
    exit 3
  fi
}

# Usage: launch <print 0|1> <dry 0|1> <prompt> [extra claude args...]
launch() {
  local print=$1 dry=$2 prompt=$3 a
  shift 3
  local cmd=("${CLAUDE_BIN:-claude}" --model sonnet --plugin-dir "$PLUGIN_DIR")
  [ "$print" -eq 0 ] || cmd+=(-p --output-format json)
  # ScheduleWakeup off: a -p run that schedules a wakeup while it waits for an agent prints the wakeup turn.
  cmd+=(--disallowedTools ScheduleWakeup)
  cmd+=(--allowedTools "${RULES[@]}")
  cmd+=("$@")
  # --allowedTools is variadic: "--" keeps the prompt from being read as one more rule.
  cmd+=(-- "$prompt")
  echo "$NAME: running (one argument per line):" >&2
  for a in "${cmd[@]}"; do printf "  '%s'\n" "$a" >&2; done
  [ "$dry" -eq 0 ] || exit 0
  exec "${cmd[@]}"
}
