# Sourced by the hooks. Hooks run in a non-interactive shell, so select the project's Node (.nvmrc) through nvm.
export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
if [ -s "$NVM_DIR/nvm.sh" ]; then
    # shellcheck disable=SC1091
    . "$NVM_DIR/nvm.sh" --no-use
    nvm use --silent >/dev/null 2>&1 || true
fi
export PATH="$CLAUDE_PROJECT_DIR/node_modules/.bin:$PATH"
