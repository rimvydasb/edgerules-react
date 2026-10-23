#!/usr/bin/env bash
# Stop and SubagentStop: run dependency-cruiser and `npm run check` (typecheck, lint, depcruise, unit tests) before the
# agent finishes.
# - dependency-cruiser (markdown file naming, etc.) always runs: it takes under a second.
# - The full check skips when no code file differs from HEAD, or when this exact change set already passed.
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

fail() {
    attempts=$(($(cat "$attempts_file" 2>/dev/null || echo 0) + 1))
    echo "$attempts" >"$attempts_file"
    if [ "$attempts" -gt "$MAX_ATTEMPTS" ]; then
        rm -f "$attempts_file"
        jq -n --arg n "$MAX_ATTEMPTS" --arg c "$1" '{systemMessage: ($c + " still fails after " + $n + " fix attempts. Run it to see the errors.")}'
        exit 0
    fi
    {
        echo "$1 failed (attempt $attempts of $MAX_ATTEMPTS). Fix the errors below, then finish:"
        printf '%s\n' "$2" | tail -80
    } >&2
    exit 2
}

. "$CLAUDE_PROJECT_DIR/.claude/hooks/node-env.sh"

out=$(npm run depcruise --silent 2>&1) || fail "npm run depcruise" "$out"

code=('*.ts' '*.tsx' '*.js' '*.cjs' '*.mjs' 'package.json' 'package-lock.json' 'tsconfig.json' '.oxlintrc.json')
changed=$(git diff HEAD --name-only -- "${code[@]}"; git ls-files --others --exclude-standard -- "${code[@]}")
[ -z "$changed" ] && { rm -f "$attempts_file"; exit 0; }

fingerprint=$({
    git diff HEAD -- "${code[@]}"
    git ls-files --others --exclude-standard -z -- "${code[@]}" | xargs -0 cat 2>/dev/null
} | shasum | cut -d' ' -f1)
[ "$(cat "$pass_file" 2>/dev/null)" = "$fingerprint" ] && { rm -f "$attempts_file"; exit 0; }

if out=$(npm run check --silent 2>&1); then
    echo "$fingerprint" >"$pass_file"
    rm -f "$attempts_file"
    exit 0
fi

fail "npm run check" "$out"
