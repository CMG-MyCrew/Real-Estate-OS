#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SRC_DIR="$ROOT_DIR/src"
DIST_DIR="$ROOT_DIR/dist"
PACKAGE_DIR="$DIST_DIR/reos-appscript-deployment"
ZIP_FILE="$DIST_DIR/reos-appscript-deployment.zip"

if [ ! -d "$SRC_DIR" ]; then
  echo "ERROR: src directory not found: $SRC_DIR" >&2
  exit 1
fi

rm -rf "$PACKAGE_DIR" "$ZIP_FILE"
mkdir -p "$PACKAGE_DIR" "$DIST_DIR"

# Copy only Google Apps Script-compatible source files.
find "$SRC_DIR" -maxdepth 1 -type f \( -name '*.gs' -o -name '*.html' -o -name 'appsscript.json' \) -print0 \
  | while IFS= read -r -d '' file; do
      cp "$file" "$PACKAGE_DIR/$(basename "$file")"
    done

if [ ! -f "$PACKAGE_DIR/appsscript.json" ]; then
  echo "ERROR: appsscript.json is missing from package." >&2
  exit 1
fi

# Create import manifest for verification.
{
  echo "REOS Apps Script Deployment Package"
  echo "Generated At: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo "Source: $SRC_DIR"
  echo ""
  echo "Files:"
  find "$PACKAGE_DIR" -maxdepth 1 -type f | sed 's|.*/||' | sort
} > "$PACKAGE_DIR/IMPORT_MANIFEST.txt"

( cd "$PACKAGE_DIR" && zip -q -r "$ZIP_FILE" . )

echo "Package created: $PACKAGE_DIR"
echo "Zip created: $ZIP_FILE"
echo "File count: $(find "$PACKAGE_DIR" -maxdepth 1 -type f | wc -l)"
