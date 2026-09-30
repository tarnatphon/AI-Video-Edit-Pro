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
#    1. Ensures Xcode Command Line Tools (git)      4. npm install (uses lockfile when present)
#    2. Ensures Node.js >= 20 (via Homebrew)         5. Typecheck + unit tests (warn only)
#    3. Clones/syncs repository & remembers path    6. Starts the editor and opens your browser
#
#  Options (environment variables):
#    AIVEP_DIR=~/Code/AI-Video-Edit-Pro   install location (highest priority; default: remembered or ~/AI-Video-Edit-Pro)
#    AIVEP_BRANCH=main                    git branch to check out (existing checkouts stay on their branch unless set)
#    AIVEP_HTTPS=1                        serve over https (self-signed) so iPad/Android get OPFS + full APIs
#    AIVEP_NO_OPEN=1                      do not auto-open the browser
#    AIVEP_SKIP_CHECKS=1                  skip typecheck/tests for a faster start
# =================================================================================================
set -euo pipefail

REPO_URL="https://github.com/tarnatphon/AI-Video-Edit-Pro.git"
BRANCH="${AIVEP_BRANCH:-main}"
MIN_NODE=20
PORT=5173

CONFIG_DIR="${XDG_CONFIG_HOME:-$HOME/.config}/aivep"
LAST_DIR_FILE="$CONFIG_DIR/last_dir"

log()  { printf '\033[1;35m[AI Video Edit Pro]\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m[warn]\033[0m %s\n' "$*" >&2; }
fail() { printf '\033[1;31m[error]\033[0m %s\n' "$*" >&2; exit 1; }

[[ "$(uname -s)" == "Darwin" ]] || warn "This script targets macOS; continuing anyway."

# ---------------------------------------------------------------- Path resolution & memory
# Priority:
#  1. Explicit AIVEP_DIR environment variable (always wins)
#  2. Current directory if running from inside an existing checkout
#  3. Remembered last-used path from previous runs
#  4. Default path (~/AI-Video-Edit-Pro)

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" 2>/dev/null && pwd || true)"

if [[ -n "${AIVEP_DIR:-}" ]]; then
  # Expand leading tilde if present
  DIR="${AIVEP_DIR/#\~/$HOME}"
  log "Using specified AIVEP_DIR: $DIR"
elif [[ -n "$SCRIPT_DIR" && -f "$SCRIPT_DIR/package.json" && -d "$SCRIPT_DIR/src/engine" ]]; then
  DIR="$SCRIPT_DIR"
  log "Using current checkout: $DIR"
elif [[ -f "$LAST_DIR_FILE" ]] && [[ -n "$(cat "$LAST_DIR_FILE" 2>/dev/null | tr -d '\r\n')" ]]; then
  SAVED_DIR="$(cat "$LAST_DIR_FILE" 2>/dev/null | tr -d '\r\n')"
  SAVED_DIR="${SAVED_DIR/#\~/$HOME}"
  if [[ -d "$SAVED_DIR" || "$SAVED_DIR" == /Volumes/* ]]; then
    DIR="$SAVED_DIR"
    log "Using remembered directory: $DIR"
  else
    DIR="$HOME/AI-Video-Edit-Pro"
    log "Remembered path not found ($SAVED_DIR); defaulting to: $DIR"
  fi
else
  DIR="$HOME/AI-Video-Edit-Pro"
  log "Using default directory: $DIR"
fi

# Save remembered path for subsequent runs
save_last_dir() {
  local target="$1"
  mkdir -p "$CONFIG_DIR" 2>/dev/null || true
  printf '%s\n' "$target" > "$LAST_DIR_FILE" 2>/dev/null || true
}

# Volume mount & filesystem check
check_filesystem() {
  local target="$1"
  local check_path="$target"

  # Find the lowest existing ancestor directory
  while [[ ! -d "$check_path" && "$check_path" != "/" && "$check_path" != "." ]]; do
    check_path="$(dirname "$check_path")"
  done

  # Check if under /Volumes/... and verify volume is mounted
  if [[ "$target" == /Volumes/* ]]; then
    local vol_name
    vol_name="$(printf '%s\n' "$target" | cut -d'/' -f3)"
    local vol_path="/Volumes/$vol_name"
    if [[ ! -d "$vol_path" ]]; then
      fail "External drive volume '$vol_path' is not mounted. Please connect the drive and try again."
    fi
  fi

  # macOS Filesystem check (APFS / HFS+)
  if [[ "$(uname -s)" == "Darwin" ]] && command -v diskutil >/dev/null 2>&1; then
    local fs_info fs_type
    fs_info="$(diskutil info "$check_path" 2>/dev/null || true)"
    fs_type="$(printf '%s\n' "$fs_info" | grep -E "Type \(Bundle\):|File System Personality:" | head -n 1 | awk -F: '{print $2}' | xargs || true)"
    
    # Fallback to stat if diskutil didn't report personality
    if [[ -z "$fs_type" ]] && command -v stat >/dev/null 2>&1; then
      fs_type="$(stat -f "%HT" "$check_path" 2>/dev/null || stat -f "%T" "$check_path" 2>/dev/null || true)"
    fi

    if [[ -n "$fs_type" ]]; then
      case "$fs_type" in
        *apfs*|*APFS*)
          log "Filesystem verified: APFS ($check_path)"
          ;;
        *hfs*|*HFS*|*Journaled*)
          log "Filesystem verified: Apple HFS+ ($check_path)"
          ;;
        *exfat*|*ExFAT*|*msdos*|*FAT*|*ntfs*|*NTFS*)
          warn "Directory is on an ${fs_type} volume ($check_path). APFS is strongly recommended on macOS for optimal performance and atomic file locks."
          ;;
        *)
          log "Filesystem: ${fs_type} ($check_path)"
          ;;
      esac
    fi
  fi
}

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
check_filesystem "$DIR"

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

if [[ -d "$DIR/.git" ]]; then
  update_checkout "$DIR"
else
  log "Cloning into $DIR ($BRANCH)…"
  mkdir -p "$(dirname "$DIR")"
  git clone --quiet --branch "$BRANCH" "$REPO_URL" "$DIR"
fi

save_last_dir "$DIR"
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
