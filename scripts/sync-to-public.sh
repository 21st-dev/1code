#!/bin/bash
set -e

# Sync desktop app to the public OpenCodex repository mirror
# Usage: ./scripts/sync-to-public.sh
#
# Required env:
#   OPENCODEX_PUBLIC_REPO_GIT   git remote URL for the public mirror
#   OPENCODEX_PUBLIC_REPO_HTTPS GitHub HTTPS repo URL for gh release operations
#   OPENCODEX_PRIVATE_REPO      source repo slug for release-note lookup
#
# This script:
# 1. Syncs code from private repo to public repo
# 2. Creates a GitHub release in public repo with same notes as private repo

require_env() {
    local name="$1"
    local value="${!name}"
    if [ -z "$value" ]; then
        echo "Missing required env: $name" >&2
        exit 1
    fi
}

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DESKTOP_DIR="$(dirname "$SCRIPT_DIR")"
ROOT_DIR="$(cd "$DESKTOP_DIR/../.." && pwd)"
VERSION=$(node -p "require('$DESKTOP_DIR/package.json').version")
TAG="v$VERSION"

require_env OPENCODEX_PUBLIC_REPO_GIT
require_env OPENCODEX_PUBLIC_REPO_HTTPS
require_env OPENCODEX_PRIVATE_REPO

PUBLIC_REPO="$OPENCODEX_PUBLIC_REPO_GIT"
PUBLIC_REPO_HTTPS="$OPENCODEX_PUBLIC_REPO_HTTPS"
PRIVATE_REPO="$OPENCODEX_PRIVATE_REPO"
TEMP_DIR=$(mktemp -d "${TMPDIR:-/tmp}/opencodex-sync-XXXXXX")

echo "🔄 Syncing desktop app to public repository..."
echo "   Version: $VERSION"
echo "   Tag: $TAG"
echo "   Public repo: $PUBLIC_REPO_HTTPS"
echo ""

# Get release notes from private repo
echo "📝 Fetching release notes from private repo..."
RELEASE_NOTES=$(gh release view "$TAG" --repo "$PRIVATE_REPO" --json body -q '.body' 2>/dev/null || echo "")

if [ -z "$RELEASE_NOTES" ]; then
    echo "⚠️  No release found for $TAG in private repo"
    echo "   Please create a release in the private repo first:"
    echo "   gh release create $TAG --repo \"$PRIVATE_REPO\" --title \"OpenCodex $TAG\" --notes \"...\""
    echo ""
    read -p "Continue without release notes? (y/N) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "Aborted."
        exit 1
    fi
    RELEASE_NOTES="Release $TAG"
fi

echo "   Release notes found!"
echo ""

# Clone public repo
echo "📥 Cloning public repository..."
git clone --depth 1 "$PUBLIC_REPO" "$TEMP_DIR"

# Remove old content (except .git)
echo "🗑️  Cleaning old content..."
find "$TEMP_DIR" -mindepth 1 -maxdepth 1 ! -name '.git' -exec rm -rf {} +

# Copy current desktop app to root
echo "📋 Copying desktop app..."
rsync -av --exclude-from=- "$DESKTOP_DIR/" "$TEMP_DIR/" << 'EOF'
# Exclude private/local files
.env.local
.auth-plan
.turbo
node_modules
out
release
release-*
resources/bin
*.log
.DS_Store
electron.vite.config.*.mjs

# Exclude internal planning docs
PLAN-*.md
ERROR-HANDLING.md
docs/
test-electron.js

# Exclude internal release docs (contains credentials, CDN URLs)
RELEASE.md
scripts/upload-release.mjs

# Exclude wrangler local state (large R2 blobs)
.wrangler
EOF

# Commit and push
echo "📤 Committing and pushing..."
cd "$TEMP_DIR"
git add -A

# Check if there are changes
if git diff --staged --quiet; then
    echo "ℹ️  No code changes to sync"
else
    git commit -m "Release $TAG

$RELEASE_NOTES"

    git push origin main
    echo "✅ Code synced successfully"
fi

# Create/update GitHub release in public repo
echo ""
echo "🏷️  Creating GitHub release in public repo..."

# Check if release already exists
if gh release view "$TAG" --repo "$PUBLIC_REPO_HTTPS" &>/dev/null; then
    echo "   Release $TAG already exists, updating..."
    gh release edit "$TAG" \
        --repo "$PUBLIC_REPO_HTTPS" \
        --title "OpenCodex $TAG" \
        --notes "$RELEASE_NOTES"
else
    echo "   Creating new release $TAG..."
    # Create tag if it doesn't exist
    git tag -f "$TAG"
    git push origin "$TAG" --force

    gh release create "$TAG" \
        --repo "$PUBLIC_REPO_HTTPS" \
        --title "OpenCodex $TAG" \
        --notes "$RELEASE_NOTES"
fi

echo "✅ GitHub release created/updated"
echo "   🔗 $PUBLIC_REPO_HTTPS/releases/tag/$TAG"

# Cleanup
echo ""
echo "🧹 Cleaning up..."
rm -rf "$TEMP_DIR"

echo ""
echo "✨ Done! Public repo synced with release $TAG"
