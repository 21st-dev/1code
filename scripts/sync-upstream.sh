#!/bin/bash
# Sync fork with upstream while preserving fork-specific customizations

set -e

echo "📥 Fetching upstream..."
git fetch upstream

echo "🔄 Merging upstream/main..."
# Try to merge, if conflicts occur we'll handle them
git merge upstream/main --no-edit || true

# Check for conflicts
if git diff --name-only --diff-filter=U | grep -q .; then
  echo "⚠️  Conflicts detected, auto-resolving fork customizations..."

  # For package.json: keep our appId and protocol, take upstream version
  if git diff --name-only --diff-filter=U | grep -q "package.json"; then
    echo "  Resolving package.json..."
    git checkout --theirs package.json
    # Re-apply our customizations
    sed -i '' 's/"appId": "dev\.21st\.agents"/"appId": "dev.aadivar.1code"/' package.json
    sed -i '' 's/"twentyfirst-agents"/"aadivar-1code"/' package.json
    git add package.json
  fi

  # For electron-builder.ci.yml
  if git diff --name-only --diff-filter=U | grep -q "electron-builder.ci.yml"; then
    echo "  Resolving electron-builder.ci.yml..."
    git checkout --theirs electron-builder.ci.yml
    sed -i '' 's/dev\.21st\.agents/dev.aadivar.1code/' electron-builder.ci.yml
    git add electron-builder.ci.yml
  fi

  # For source files with protocol
  for file in src/main/index.ts src/main/auth-manager.ts src/main/lib/trpc/routers/debug.ts; do
    if git diff --name-only --diff-filter=U | grep -q "$file"; then
      echo "  Resolving $file..."
      git checkout --theirs "$file"
      sed -i '' 's/twentyfirst-agents/aadivar-1code/g' "$file"
      git add "$file"
    fi
  done

  # For files with our new features (keep ours + theirs)
  for file in src/main/lib/trpc/routers/index.ts src/renderer/components/dialogs/settings-tabs/agents-preferences-tab.tsx; do
    if git diff --name-only --diff-filter=U | grep -q "$file"; then
      echo "  ⚠️  $file has conflicts - manual resolution needed"
    fi
  done

  # Check if all conflicts resolved
  if git diff --name-only --diff-filter=U | grep -q .; then
    echo ""
    echo "❌ Some conflicts need manual resolution:"
    git diff --name-only --diff-filter=U
    exit 1
  fi

  echo "✅ All conflicts resolved!"
  git commit -m "Merge upstream + preserve fork customizations"
else
  echo "✅ No conflicts!"
fi

# Get upstream version and create tag
VERSION=$(grep '"version"' package.json | head -1 | sed 's/.*: "\(.*\)".*/\1/')
echo ""
echo "📦 Version: $VERSION"
echo ""
read -p "Create and push tag v$VERSION? (y/n) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
  git tag -d "v$VERSION" 2>/dev/null || true
  git tag "v$VERSION"
  git push origin main
  git push origin "v$VERSION"
  echo "✅ Pushed v$VERSION"
fi
