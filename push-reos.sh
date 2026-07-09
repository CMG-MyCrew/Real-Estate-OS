#!/usr/bin/env bash

set -e

BRANCH="main"
COMMIT_MESSAGE="${1:-Sync REOS Enterprise updates}"

echo "======================================"
echo " REOS Enterprise GitHub Push"
echo "======================================"

if [ ! -d ".git" ]; then
  echo "ERROR: This folder is not a Git repository."
  exit 1
fi

git checkout "$BRANCH"

echo ""
echo "Checking local changes..."
git status --short

if ! git diff --quiet || ! git diff --cached --quiet; then
  echo ""
  echo "Adding and committing local changes..."
  git add .
  git commit -m "$COMMIT_MESSAGE"
else
  echo "No local changes to commit."
fi

echo ""
echo "Pulling latest changes from GitHub..."
git pull origin "$BRANCH" --rebase

echo ""
echo "Pushing to GitHub..."
git push origin "$BRANCH"

echo ""
echo "======================================"
echo " Push complete."
echo "======================================"
