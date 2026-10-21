#!/usr/bin/env bash
# SessionStart hook: makes nvm's default alias match .nvmrc, so every fresh
# shell Claude Code spawns for Bash tool calls resolves to the right Node
# version (each Bash call starts a new shell; only nvm's persisted default
# alias carries across calls, not a plain `nvm use` in this hook's process).
set -euo pipefail

export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
if [ -s "$NVM_DIR/nvm.sh" ]; then
  # shellcheck disable=SC1091
  . "$NVM_DIR/nvm.sh"
else
  echo '{"systemMessage": "nvm not found at $NVM_DIR/nvm.sh - could not enforce .nvmrc Node version."}'
  exit 0
fi

project_dir="${CLAUDE_PROJECT_DIR:-$(pwd)}"
nvmrc_path="$project_dir/.nvmrc"

if [ ! -f "$nvmrc_path" ]; then
  exit 0
fi

wanted="$(tr -d '[:space:]' < "$nvmrc_path")"
current_default="$(nvm version default 2>/dev/null || echo none)"

if ! nvm ls "$wanted" >/dev/null 2>&1 || [ "$(nvm version "$wanted" 2>/dev/null)" = "N/A" ]; then
  nvm install "$wanted" >/dev/null 2>&1
fi

resolved="$(nvm version "$wanted" 2>/dev/null || echo N/A)"

if [ "$resolved" = "N/A" ]; then
  echo "{\"systemMessage\": \"Could not install/resolve Node $wanted via nvm for this project's .nvmrc.\"}"
  exit 0
fi

if [ "$current_default" != "$resolved" ]; then
  nvm alias default "$wanted" >/dev/null 2>&1
  echo "{\"systemMessage\": \"nvm default switched to Node $resolved (from .nvmrc).\"}"
fi
