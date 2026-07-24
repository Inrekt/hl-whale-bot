#!/usr/bin/env bash
# Persist state/ to the `state` branch as a single (amended) commit.
# state/ is a git worktree of that branch, prepared by the workflow. No-op locally.
set -euo pipefail

cd "$(dirname "$0")/.."
if [ ! -d state/.git ] && [ ! -f state/.git ]; then
  exit 0 # not a worktree (local dev) — files stay on disk only
fi

cd state
git add -A
if git diff --cached --quiet; then
  exit 0
fi
if git rev-parse --quiet --verify HEAD >/dev/null; then
  git commit --quiet --amend -m "state: $(date -u +%FT%TZ)"
else
  git commit --quiet -m "state: $(date -u +%FT%TZ)"
fi
git push --quiet --force origin HEAD:state
