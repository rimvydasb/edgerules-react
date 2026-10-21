#!/usr/bin/env bash
# PostToolUse (Edit, Write, MultiEdit): format the file the agent changed, then report its lint errors.
# Exit 2 sends stderr back to the agent, which then fixes the file.
set -uo pipefail

file=$(jq -r '.tool_input.file_path // empty')
cd "$CLAUDE_PROJECT_DIR" || exit 0
case "$file" in
    "$CLAUDE_PROJECT_DIR"/*) rel=${file#"$CLAUDE_PROJECT_DIR"/} ;;
    *) exit 0 ;; # outside the repository
esac
[ -f "$rel" ] || exit 0

. "$CLAUDE_PROJECT_DIR/.claude/hooks/node-env.sh"

case "$rel" in
    *.ts | *.tsx | *.js | *.cjs | *.mjs | *.md | .github/workflows/*.yml) prettier --write --log-level error "$rel" >&2 ;;
    *) exit 0 ;;
esac

case "$rel" in
    *.ts | *.tsx | *.js | *.cjs | *.mjs)
        if ! out=$(oxlint --type-aware --quiet "$rel" 2>&1); then
            printf 'Lint errors in %s. Fix them:\n%s\n' "$rel" "$(printf '%s' "$out" | head -40)" >&2
            exit 2
        fi
        ;;
    .github/workflows/*.yml)
        if command -v actionlint >/dev/null && ! out=$(actionlint "$rel" 2>&1); then
            printf 'actionlint errors in %s. Fix them:\n%s\n' "$rel" "$(printf '%s' "$out" | head -40)" >&2
            exit 2
        fi
        ;;
esac
exit 0
