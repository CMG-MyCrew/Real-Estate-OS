#!/usr/bin/env bash

set -e

BRANCH="main"
COMMIT_MESSAGE="${1:-Sync REOS Enterprise updates}"

echo "======================================"
echo " REOS Enterprise GitHub Push"
echo "======================================"

if [ ! -d ".git" ]; then
  echo "ERROR: This folder is not a Git repository."
  echo "Go to your Real-Estate-OS repo folder first."
  exit 1
fi

echo "Current folder:"
pwd

echo ""
echo "Git remote:"
git remote -v

echo ""
echo "Switching to branch: $BRANCH"
git checkout "$BRANCH"

echo ""
echo "Pulling latest changes from GitHub..."
git pull origin "$BRANCH" --rebase

echo ""
echo "Checking changed files..."
git status --short

echo ""
echo "Adding changes..."
git add .

if git diff --cached --quiet; then
  echo "No changes to commit."
  echo "REOS is already up to date."
  exit 0
fi

echo ""
echo "Committing changes..."
git commit -m "$COMMIT_MESSAGE"

echo ""
echo "Pushing to GitHub..."
git push origin "$BRANCH"

echo ""
echo "======================================"
echo " Push complete."
echo " Repository: CMG-MyCrew/Real-Estate-OS"
echo " Branch: $BRANCH"
echo "======================================"
