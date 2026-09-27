#!/usr/bin/env bash
# =================================================================================================
#  AI Video Edit Pro — one-shot setup & launch for macOS Terminal
#
#  Copy/paste ONE of these into Terminal:
#    curl -fsSL https://raw.githubusercontent.com/tarnatphon/AI-Video-Edit-Pro/main/setup-mac.sh | bash
#    # or, from inside a checkout:
#    bash setup-mac.sh
#
#  What it does (idempotent — safe to run again):
#    1. Ensures Xcode Command Line Tools (git)      4. npm install (uses the lockfile when present)
#    2. Ensures Node.js >= 20 (via Homebrew)         5. Typecheck + unit tests (warn only)
#    3. Clones the repository, or syncs it with GitHub  6. Starts the editor and opens your browser
#
#  Options (environment variables):
#    AIVEP_DIR=~/Code/AI-Video-Edit-Pro   install location (default: ~/AI-Video-Edit-Pro)
#    AIVEP_BRANCH=main                    git branch to check out (existing checkouts stay on their branch unless set)
#    AIVEP_HTTPS=1                        serve over https (self-signed) so iPad/Android get OPFS + full APIs
#    AIVEP_NO_OPEN=1                      do not auto-open the browser
#    AIVEP_SKIP_CHECKS=1                  skip typecheck/tests for a faster start
# =================================================================================================
set -euo pipefail

REPO_URL="https://github.com/tarnatphon/AI-Video-Edit-Pro.git"
BRANCH="${AIVEP_BRANCH:-main}"
DIR="${AIVEP_DIR:-$HOME/AI-Video-Edit-Pro}"
MIN_NODE=20
PORT=5173

log()  { printf '\033[1;35m[AI Video Edit Pro]\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m[warn]\033[0m %s\n' "$*" >&2; }
fail() { printf '\033[1;31m[error]\033[0m %s\n' "$*" >&2; exit 1; }

[[ "$(uname -s)" == "Darwin" ]] || warn "This script targets macOS; continuing anyway."

# ---------------------------------------------------------------- 1. Xcode Command Line Tools (git)
if ! xcode-select -p >/dev/null 2>&1; then
  log "Installing Xcode Command Line Tools — accept the dialog, then re-run this script."
  xcode-select --install || true
  exit 0
fi
command -v git >/dev/null 2>&1 || fail "git not found even though Command Line Tools are installed."

# ---------------------------------------------------------------- 2. Node.js >= 20
node_ok() {
  command -v node >/dev/null 2>&1 && [[ "$(node -p 'parseInt(process.versions.node, 10)')" -ge "$MIN_NODE" ]]
}
if ! node_ok; then
  if ! command -v brew >/dev/null 2>&1; then
    log "Installing Homebrew (you may be asked for your Mac password)…"
    NONINTERACTIVE=1 /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
  fi
  if [[ -x /opt/homebrew/bin/brew ]]; then eval "$(/opt/homebrew/bin/brew shellenv)"; fi   # Apple Silicon
  if [[ -x /usr/local/bin/brew ]];    then eval "$(/usr/local/bin/brew shellenv)";    fi   # Intel
  log "Installing Node.js…"
  brew install node
  node_ok || fail "Node.js >= ${MIN_NODE} is required. Install it from https://nodejs.org and re-run."
fi
log "Node $(node -v) · npm $(npm -v)"

# ---------------------------------------------------------------- 3. Source code
# Sync an existing checkout with GitHub. Never destructive: local edits or a diverged branch only
# produce a warning and the code already on disk is used.
update_checkout() {
  local dir="$1" current target
  if ! git -C "$dir" fetch --quiet --prune origin; then
    warn "Could not reach GitHub — using the code already in $dir."
    return 0
  fi
  if [[ -n "$(git -C "$dir" status --porcelain --untracked-files=no)" ]]; then
    warn "Uncommitted changes in $dir — skipping the update. Commit or 'git stash' them to sync."
    return 0
  fi
  current="$(git -C "$dir" rev-parse --abbrev-ref HEAD)"
  target="${AIVEP_BRANCH:-$current}"                 # explicit branch wins, otherwise stay where you are
  [[ "$target" == "HEAD" ]] && target="$BRANCH"      # detached HEAD → default branch
  if [[ "$target" != "$current" ]]; then
    log "Switching $dir to branch '$target'…"
    git -C "$dir" checkout --quiet "$target" || fail "Branch '$target' does not exist on origin."
  fi
  log "Updating $dir ($target)…"
  git -C "$dir" pull --ff-only --quiet origin "$target" ||
    warn "Branch '$target' has diverged from origin — left untouched. Run 'git status' in $dir to resolve."
}

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" 2>/dev/null && pwd || true)"
if [[ -n "$SCRIPT_DIR" && -f "$SCRIPT_DIR/package.json" && -d "$SCRIPT_DIR/src/engine" ]]; then
  DIR="$SCRIPT_DIR"
  log "Using existing checkout: $DIR"
fi
if [[ -d "$DIR/.git" ]]; then
  update_checkout "$DIR"
else
  log "Cloning into $DIR ($BRANCH)…"
  git clone --quiet --branch "$BRANCH" "$REPO_URL" "$DIR"
fi
cd "$DIR"

# ---------------------------------------------------------------- 4. Dependencies
log "Installing dependencies…"
if [[ -f package-lock.json ]]; then
  npm ci --no-audit --no-fund || npm install --no-audit --no-fund
else
  npm install --no-audit --no-fund
fi

# ---------------------------------------------------------------- 5. Checks (informational — never block the launch)
if [[ "${AIVEP_SKIP_CHECKS:-0}" != "1" ]]; then
  log "Typechecking…"
  if ! npm run -s typecheck; then
    warn "Typecheck reported errors. The editor will still start (Vite does not need tsc); please report the output above."
  fi
  log "Running tests…"
  if ! npm run -s test -- --reporter=dot; then
    warn "Some tests failed on Node $(node -v). This does not affect the editor itself; starting anyway."
  fi
fi

# ---------------------------------------------------------------- 6. Launch
PROTO="http"; [[ "${AIVEP_HTTPS:-0}" == "1" ]] && PROTO="https"
LAN_IP="$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || true)"

log "Starting the editor…"
log "  Mac / this computer : ${PROTO}://localhost:${PORT}"
if [[ -n "$LAN_IP" ]]; then
  log "  iPad / Android      : ${PROTO}://${LAN_IP}:${PORT}   (same Wi-Fi)"
  [[ "$PROTO" == "http" ]] && log "  Tip: AIVEP_HTTPS=1 enables on-device storage (OPFS) on tablets."
fi
log "Press Ctrl+C to stop."

if [[ "${AIVEP_NO_OPEN:-0}" != "1" ]]; then
  ( sleep 2; open "${PROTO}://localhost:${PORT}" ) >/dev/null 2>&1 &
fi

if [[ "$PROTO" == "https" ]]; then
  exec npm run dev:https
else
  exec npm run dev
fi
