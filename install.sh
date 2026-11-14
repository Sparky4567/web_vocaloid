#!/usr/bin/env bash
# Install Chorus on Debian/Ubuntu; run as your normal user.
set -Eeuo pipefail

PROJECT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
CLASSIC_ONLY=0
SKIP_SYSTEM=0
DRY_RUN=0
INSTALL_TMP=""

usage() {
  cat <<'HELP'
Usage: ./install.sh [options]

Install native tools, Bun, app packages, and the local LIEE singing runtime.
Supported automatic system setup: Debian/Ubuntu (including their WSL environments).
Run as a normal user; sudo is used only for apt-get when required.

Options:
  --classic-only  Install classic voices without uv, Python runtime, or the model
  --skip-system   Check existing native tools without running apt-get
  --dry-run       Print the installation plan without changing anything
  -h, --help      Show this help

Full setup downloads a ~581 MiB voicebank and Python packages. The project code
is MIT licensed; the voicebank and vocoder retain their own terms (see README.md).
HELP
}

for argument in "$@"; do
  case "$argument" in
    --classic-only) CLASSIC_ONLY=1 ;;
    --skip-system) SKIP_SYSTEM=1 ;;
    --dry-run) DRY_RUN=1 ;;
    -h|--help) usage; exit 0 ;;
    *) printf 'Unknown option: %s\n' "$argument" >&2; usage >&2; exit 2 ;;
  esac
done

cleanup() {
  if [[ -n "$INSTALL_TMP" && -d "$INSTALL_TMP" ]]; then rm -rf -- "$INSTALL_TMP"; fi
}
trap cleanup EXIT
trap 'printf "Installation stopped at line %s. Resolve the error above, then rerun ./install.sh.\n" "$LINENO" >&2' ERR

run() {
  printf '  '
  printf '%q ' "$@"
  printf '\n'
  if (( ! DRY_RUN )); then "$@"; fi
}

need() {
  if (( ! DRY_RUN )) && ! command -v "$1" >/dev/null 2>&1; then
    printf 'Missing required tool: %s. Install it, or rerun without --skip-system.\n' "$1" >&2
    exit 1
  fi
}

cd -- "$PROJECT_DIR"
# Include standard user-local locations for tools installed on an earlier run.
export PATH="${BUN_INSTALL:-$HOME/.bun}/bin:$HOME/.local/bin:$PATH"

printf 'Installing Chorus in %s\n' "$PROJECT_DIR"
if (( ! SKIP_SYSTEM )); then
  if ! command -v apt-get >/dev/null 2>&1; then
    printf 'Automatic system setup requires Debian/Ubuntu with apt-get.\nInstall curl, unzip, eSpeak, FFmpeg (with rubberband), then use --skip-system.\n' >&2
    exit 1
  fi
  ELEVATE=()
  if (( EUID != 0 )); then
    need sudo
    ELEVATE=(sudo)
  fi
  run "${ELEVATE[@]}" apt-get update
  run "${ELEVATE[@]}" apt-get install -y ca-certificates curl unzip espeak ffmpeg libgomp1 libstdc++6
fi

for dependency in curl unzip espeak ffmpeg; do need "$dependency"; done
if (( ! DRY_RUN )); then
  # Capture before searching: pipefail must not mistake an early grep exit for failure.
  FILTERS="$(ffmpeg -hide_banner -filters 2>&1)"
  if ! grep -Eq '[[:space:]]rubberband[[:space:]]' <<< "$FILTERS"; then
    printf 'FFmpeg lacks the rubberband filter required by the classic voices. Install a build with librubberband enabled.\n' >&2
    exit 1
  fi
fi

if (( ! DRY_RUN )); then INSTALL_TMP="$(mktemp -d "${TMPDIR:-/tmp}/chorus-install.XXXXXXXX")"; fi
BOOTSTRAP_DIR="${INSTALL_TMP:-/tmp/chorus-install-DRY-RUN}"
if ! command -v bun >/dev/null 2>&1; then
  run curl --fail --silent --show-error --location --proto '=https' --proto-redir '=https' https://bun.com/install -o "$BOOTSTRAP_DIR/bun-install.sh"
  run bash "$BOOTSTRAP_DIR/bun-install.sh"
fi
need bun
if (( ! DRY_RUN )); then
  if ! bun -e 'if (Bun.semver.order(Bun.version,"1.3.0")<0) process.exit(1)'; then
    printf 'Bun 1.3 or later is required. Upgrade Bun, then rerun ./install.sh.\n' >&2
    exit 1
  fi
fi
run bun install --frozen-lockfile

if (( ! CLASSIC_ONLY )); then
  if ! command -v uv >/dev/null 2>&1; then
    run curl --fail --silent --show-error --location --proto '=https' --proto-redir '=https' https://astral.sh/uv/install.sh -o "$BOOTSTRAP_DIR/uv-install.sh"
    run env UV_INSTALL_DIR="$HOME/.local/bin" UV_NO_MODIFY_PATH=1 sh "$BOOTSTRAP_DIR/uv-install.sh"
  fi
  need uv
  run bun run model:download
  run bun run model:setup
fi

run bun run typecheck
run bun run build
if (( DRY_RUN )); then
  printf '\nDry run complete. No packages, models, or files were changed.\n'
else
  printf '\nChorus is installed. Start it with:\n  cd %q\n  bun run dev\n\nOpen http://localhost:3000 (unless PORT is configured differently).\n' "$PROJECT_DIR"
fi
