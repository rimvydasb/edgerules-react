#!/usr/bin/env bash
# Stop and SubagentStop: run `npm run check` (typecheck, lint, unit tests) before the agent finishes.
# - Skips when no code file differs from HEAD, or when this exact change set already passed.
# - On failure, exit 2 sends the output back to the agent, which keeps working.
# - After MAX_ATTEMPTS failures in one session, it lets the agent stop and tells the user.
set -uo pipefail

MAX_ATTEMPTS=3
input=$(cat)
cd "$CLAUDE_PROJECT_DIR" || exit 0
session=$(jq -r '.session_id // "none"' <<<"$input")

state_dir="${TMPDIR:-/tmp}/edgerules-react-agent-check"
mkdir -p "$state_dir"
pass_file="$state_dir/last-pass"
attempts_file="$state_dir/$session.attempts"

code=('*.ts' '*.tsx' '*.js' '*.cjs' '*.mjs' 'package.json' 'package-lock.json' 'tsconfig.json' '.oxlintrc.json')
changed=$(git diff HEAD --name-only -- "${code[@]}"; git ls-files --others --exclude-standard -- "${code[@]}")
[ -z "$changed" ] && exit 0

fingerprint=$({
    git diff HEAD -- "${code[@]}"
    git ls-files --others --exclude-standard -z -- "${code[@]}" | xargs -0 cat 2>/dev/null
} | shasum | cut -d' ' -f1)
[ "$(cat "$pass_file" 2>/dev/null)" = "$fingerprint" ] && exit 0

. "$CLAUDE_PROJECT_DIR/.claude/hooks/node-env.sh"

if out=$(npm run check --silent 2>&1); then
    echo "$fingerprint" >"$pass_file"
    rm -f "$attempts_file"
    exit 0
fi

attempts=$(($(cat "$attempts_file" 2>/dev/null || echo 0) + 1))
echo "$attempts" >"$attempts_file"
if [ "$attempts" -gt "$MAX_ATTEMPTS" ]; then
    rm -f "$attempts_file"
    jq -n --arg n "$MAX_ATTEMPTS" '{systemMessage: ("npm run check still fails after " + $n + " fix attempts. Run it to see the errors.")}'
    exit 0
fi

{
    echo "npm run check failed (attempt $attempts of $MAX_ATTEMPTS). Fix the errors below, then finish:"
    printf '%s\n' "$out" | tail -80
} >&2
exit 2
