#!/usr/bin/env bash
# install-skills.sh — wire the forgetmenot skills/ into a place Claude
# (Claude Code, Claude Desktop, Anthropic Agent SDK) will auto-discover.
#
# Default: project install — creates `.claude/skills/<name>` symlinks
# in THIS repo pointing at the matching `skills/<name>/` directory.
# Claude Code picks them up automatically when opened in this repo or
# any of its parents (per https://code.claude.com/docs/en/skills).
#
# Idempotent: re-running replaces stale links and adds any new skills.
#
#   bash scripts/install-skills.sh                # project install (default)
#   bash scripts/install-skills.sh --user         # personal: ~/.claude/skills/
#   bash scripts/install-skills.sh --copy         # copy files instead of symlink
#                                                 # (Windows / restricted FS)
#   bash scripts/install-skills.sh --dry-run      # show what would happen
#   bash scripts/install-skills.sh --uninstall    # remove what we installed
#   bash scripts/install-skills.sh --help

set -euo pipefail

# Resolve repo root from this script's location so the command works
# regardless of the caller's cwd.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
SRC_DIR="$REPO_ROOT/skills"

SCOPE="project"
MODE="symlink"
DRY=0
UNINSTALL=0

usage() {
  sed -n '2,18p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
  exit "${1:-0}"
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --user) SCOPE="user" ;;
    --project) SCOPE="project" ;;
    --copy) MODE="copy" ;;
    --symlink) MODE="symlink" ;;
    --dry-run|-n) DRY=1 ;;
    --uninstall) UNINSTALL=1 ;;
    -h|--help) usage 0 ;;
    *) echo "install-skills.sh: unknown flag '$1'" >&2; usage 2 ;;
  esac
  shift
done

if [[ ! -d "$SRC_DIR" ]]; then
  echo "install-skills.sh: cannot find $SRC_DIR" >&2
  exit 1
fi

if [[ "$SCOPE" == "user" ]]; then
  DEST_DIR="${HOME}/.claude/skills"
else
  DEST_DIR="$REPO_ROOT/.claude/skills"
fi

run() {
  if [[ "$DRY" == 1 ]]; then
    printf 'DRY  %s\n' "$*"
  else
    eval "$@"
  fi
}

# Make sure the destination parent exists.
[[ -d "$DEST_DIR" ]] || run "mkdir -p '$DEST_DIR'"

# Enumerate every skill folder that has a SKILL.md.
shopt -s nullglob
declare -a SKILL_NAMES=()
for d in "$SRC_DIR"/*/; do
  name="$(basename "$d")"
  [[ -f "$d/SKILL.md" ]] || continue
  SKILL_NAMES+=("$name")
done

if [[ ${#SKILL_NAMES[@]} -eq 0 ]]; then
  echo "install-skills.sh: no skills with SKILL.md found under $SRC_DIR" >&2
  exit 1
fi

# Target path (string) and the symlink text we'd write.
# For project-scope, use a relative symlink (../../skills/<name>) so
# the link survives the repo being moved or re-cloned elsewhere. For
# user-scope, use an absolute path (only valid for THIS clone).
target_for() {
  local name="$1"
  if [[ "$SCOPE" == "user" ]]; then
    echo "$SRC_DIR/$name"
  else
    # destination is $REPO_ROOT/.claude/skills/<name>, so two levels
    # up to get to repo root, then into skills/<name>.
    echo "../../skills/$name"
  fi
}

# Real (resolved) path that any existing dest should match — used to
# detect prior installs from this same clone.
real_target_for() {
  local name="$1"
  echo "$SRC_DIR/$name"
}

if [[ "$UNINSTALL" == 1 ]]; then
  echo "Uninstalling from $DEST_DIR"
  removed=0
  for name in "${SKILL_NAMES[@]}"; do
    dest="$DEST_DIR/$name"
    [[ -e "$dest" || -L "$dest" ]] || continue
    if [[ -L "$dest" ]]; then
      run "rm '$dest'"
      ((removed++)) || true
    elif [[ -d "$dest" && "$MODE" == "copy" ]]; then
      # Only delete a directory if --copy was used — never delete
      # something that might be the user's own work.
      if [[ -f "$dest/SKILL.md" ]] && grep -q "$name" "$dest/SKILL.md" 2>/dev/null; then
        run "rm -rf '$dest'"
        ((removed++)) || true
      fi
    fi
  done
  echo "Removed $removed entries."
  exit 0
fi

# Install.
echo "Installing ${#SKILL_NAMES[@]} skills to $DEST_DIR (scope=$SCOPE, mode=$MODE)"
created=0
updated=0
skipped=0
conflicted=0
for name in "${SKILL_NAMES[@]}"; do
  dest="$DEST_DIR/$name"
  link_text="$(target_for "$name")"
  real="$(real_target_for "$name")"

  if [[ -L "$dest" ]]; then
    # Existing symlink — replace if pointing somewhere else.
    if [[ "$(readlink "$dest")" == "$link_text" ]]; then
      ((skipped++)) || true
      continue
    fi
    run "rm '$dest'"
    if [[ "$MODE" == "copy" ]]; then
      run "cp -R '$real' '$dest'"
    else
      run "ln -s '$link_text' '$dest'"
    fi
    ((updated++)) || true
    continue
  fi

  if [[ -e "$dest" ]]; then
    # Non-symlink (directory or file) already exists — leave alone
    # and flag for the user.
    echo "  CONFLICT  $dest already exists (not a symlink); skipping" >&2
    ((conflicted++)) || true
    continue
  fi

  if [[ "$MODE" == "copy" ]]; then
    run "cp -R '$real' '$dest'"
  else
    run "ln -s '$link_text' '$dest'"
  fi
  ((created++)) || true
done

echo
echo "Created:    $created"
echo "Updated:    $updated"
echo "Unchanged:  $skipped"
echo "Conflicts:  $conflicted"

if [[ "$DRY" == 1 ]]; then
  echo "(dry run — no changes made)"
fi

if [[ "$SCOPE" == "project" ]]; then
  cat <<EOF

Next step:
  Open this repo with Claude Code (\`claude\` in this directory).
  Skills auto-discover from .claude/skills/ at the project root.
  To verify: ask Claude "What skills are available?"
EOF
else
  cat <<EOF

Next step:
  Restart Claude Code / Claude Desktop. Skills auto-discover from
  ~/.claude/skills/ and are now available in EVERY project.
EOF
fi
