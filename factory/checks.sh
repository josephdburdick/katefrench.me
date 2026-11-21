#!/usr/bin/env bash
# The repo's checks. Exit 0 only when the branch is fit to review.
# Runs with a job's worktree as the working directory.
set -euo pipefail

# Until the rebuild's first job lands, the branch is still the Next.js site on yarn.
if [ -f pnpm-lock.yaml ]; then
  pnpm install --frozen-lockfile --prefer-offline --reporter=silent
  pnpm lint
  pnpm typecheck
  pnpm test
  pnpm build
else
  yarn install --frozen-lockfile --silent
  yarn lint
  yarn build
fi
