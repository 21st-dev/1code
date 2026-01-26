#!/bin/bash
# Automate GitHub Repository Review
# Fetches repository information and generates review report

set -e

REPO_OWNER="21st-dev"
REPO_NAME="1code"
CURRENT_BRANCH=$(git branch --show-current)
ORIGIN_URL=$(git remote get-url origin)

echo "🔍 GitHub Repository Review Automation"
echo "========================================"
echo "Repository: $REPO_OWNER/$REPO_NAME"
echo "Current Branch: $CURRENT_BRANCH"
echo ""

# Get repository statistics
echo "📊 Gathering repository statistics..."

# Commits
TOTAL_COMMITS=$(git rev-list --count HEAD)
RECENT_COMMITS=$(git log --since="1 month ago" --oneline | wc -l | tr -d ' ')

# Contributors
echo "👥 Analyzing contributors..."
CONTRIBUTORS=$(git shortlog -sn --all | head -10)

# Files
TRACKED_FILES=$(git ls-files | wc -l | tr -d ' ')
TS_FILES=$(find . -name "*.ts" -not -path "./node_modules/*" | wc -l | tr -d ' ')
TSX_FILES=$(find . -name "*.tsx" -not -path "./node_modules/*" | wc -l | tr -d ' ')

# Branches
BRANCHES=$(git branch -r | wc -l | tr -d ' ')

# Tags
LATEST_TAG=$(git tag --list | tail -1)

# Branch comparison
AHEAD_OF_MAIN=$(git log origin/main..HEAD --oneline 2>/dev/null | wc -l | tr -d ' ') || AHEAD_OF_MAIN=0

# Generate report
REPORT_FILE="GITHUB_REPO_AUTO_REVIEW_$(date +%Y%m%d_%H%M%S).md"

cat > "$REPORT_FILE" << EOF
# Automated GitHub Repository Review

**Generated:** $(date)
**Repository:** $REPO_OWNER/$REPO_NAME
**Branch:** $CURRENT_BRANCH

## 📊 Statistics

### Commits
- **Total Commits:** $TOTAL_COMMITS
- **Last Month:** $RECENT_COMMITS commits
- **Ahead of main:** $AHEAD_OF_MAIN commits

### Codebase
- **Tracked Files:** $TRACKED_FILES
- **TypeScript Files:** $TS_FILES
- **React Components:** $TSX_FILES

### Branches & Tags
- **Remote Branches:** $BRANCHES
- **Latest Tag:** $LATEST_TAG

## 👥 Top Contributors

\`\`\`
$CONTRIBUTORS
\`\`\`

## 📝 Recent Commits (Last 10)

\`\`\`
$(git log --format="%h - %an, %ar : %s" -10)
\`\`\`

## 🔄 Branch Status

\`\`\`
$(git status --short)
\`\`\`

## 📋 Files Changed vs Main

\`\`\`
$(git diff origin/main..HEAD --stat 2>/dev/null | tail -20 || echo "No differences or main not available")
\`\`\`

---
**Report generated automatically by:** automate-github-review.sh
EOF

echo "✅ Review report generated: $REPORT_FILE"
echo ""
echo "📄 View report:"
echo "   cat $REPORT_FILE"
echo ""
echo "🌐 Open in browser:"
echo "   open https://github.com/$REPO_OWNER/$REPO_NAME"
