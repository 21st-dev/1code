# MCP Servers Access Summary

**Date:** January 26, 2026  
**Status:** Explored available MCP servers and GitHub repositories

## 🔍 Available MCP Servers

### 1. ✅ user-github (GitHub API)
**Status:** ⚠️ Authentication Required  
**Location:** `~/.cursor/projects/<project-name>/mcps/user-github/`

**Available Tools:**
- `search_repositories` - Search GitHub repositories
- `list_commits` - Get commits from a repository
- `get_file_contents` - Get file contents from GitHub
- `create_or_update_file` - Create/update files in GitHub
- `create_pull_request` - Create PRs
- `list_pull_requests` - List PRs
- `get_pull_request` - Get PR details
- `create_issue` - Create issues
- `list_issues` - List issues
- `search_code` - Search code across GitHub
- `create_branch` - Create branches
- `merge_pull_request` - Merge PRs
- And more...

**Issue:** Authentication failed - needs GitHub token configuration  
**Action Required:** Configure GitHub token in MCP settings

### 2. ✅ user-supermemory (Memory/Knowledge Base)
**Status:** ✅ Working  
**Location:** `~/.cursor/projects/<project-name>/mcps/user-supermemory/`

**Available Tools:**
- `whoAmI` - Get user information
- `listProjects` - List available projects
- `memory` - Save/forget information
- `recall` - Query saved memories

**Current User:**
- **Name:** Ken "Ken R" Rodrigues
- **Email:** kennyrodrigues6@gmail.com
- **User ID:** rL8wi7eHnS5VGf9jtVo2R6

**Available Projects:**
- `sm_project_default` - Main memory storage
- `sm_project_obsidian` - Obsidian sync
- `sm_project_obsidian_vault` - Original Obsidian vault

**Status:** Successfully accessed user profile and projects

### 3. ✅ cursor-ide-browser (Browser Automation)
**Status:** ✅ Available  
**Location:** `~/.cursor/projects/<project-name>/mcps/cursor-ide-browser/`

**Available Tools:**
- `browser_navigate` - Navigate to URLs
- `browser_snapshot` - Get page structure
- `browser_click` - Click elements
- `browser_type` - Type text
- `browser_fill` - Fill forms
- `browser_scroll` - Scroll pages
- `browser_take_screenshot` - Take screenshots
- `browser_tabs` - Manage tabs
- And more...

**Use Case:** Frontend/webapp development and testing

### 4. ✅ cursor-browser-extension (Browser Extension)
**Status:** ✅ Available  
**Location:** `~/.cursor/projects/<project-name>/mcps/cursor-browser-extension/`

**Use Case:** Frontend/webapp development and testing

## 📦 GitHub Repositories

### Current Repository (1code)
**Main Repo:**
- **Owner:** `21st-dev`
- **Repo:** `1code`
- **URL:** `git@github.com:21st-dev/1code.git`
- **Remote:** `origin`

**Fork:**
- **Owner:** `Tsukieomie`
- **Repo:** `1code`
- **URL:** `git@github.com:Tsukieomie/1code.git`
- **Remote:** `fork`

**Current Branch:** `performance-improvements-clean` (tracking fork)

**PR Info:** Branch `performance-improvements-clean` has PR #115 in `21st-dev/1code`

## 🔧 MCP Server Configuration

### GitHub MCP Setup Required

To enable GitHub MCP server access, you need to:

1. **Generate GitHub Personal Access Token:**
   - Go to GitHub Settings → Developer settings → Personal access tokens
   - Create token with appropriate scopes (repo, read:org, etc.)

2. **Configure in Cursor:**
   - Add token to MCP server configuration
   - Restart Cursor to apply changes

### SuperMemory MCP
✅ Already configured and working

### Browser MCPs
✅ Already configured and available

## 📊 MCP Resources Available

### SuperMemory Resources:
- `supermemory://profile` - User profile
- `supermemory://projects` - User projects

## 🎯 Recommendations

1. **Configure GitHub Token:**
   - Set up GitHub MCP authentication to enable full GitHub API access
   - This will allow searching repos, creating PRs, managing issues, etc.

2. **Use SuperMemory for Context:**
   - Save important project information to SuperMemory
   - Use `recall` to query saved memories about the project
   - Organize by project tags

3. **Browser Automation:**
   - Use browser MCPs for testing web features
   - Can automate GitHub web interface if API is unavailable

## 📝 Example Usage

### Once GitHub MCP is configured:

```typescript
// Search repositories
await call_mcp_tool('user-github', 'search_repositories', {
  query: 'user:21st-dev',
  per_page: 10
})

// Get repository info
await call_mcp_tool('user-github', 'get_repository', {
  owner: '21st-dev',
  repo: '1code'
})

// List commits
await call_mcp_tool('user-github', 'list_commits', {
  owner: '21st-dev',
  repo: '1code',
  sha: 'main'
})
```

### SuperMemory (Currently Working):

```typescript
// Save memory
await call_mcp_tool('user-supermemory', 'memory', {
  action: 'save',
  content: '1Code is an Electron app for AI-powered code assistance',
  containerTag: 'sm_project_default'
})

// Recall memory
await call_mcp_tool('user-supermemory', 'recall', {
  query: '1Code project details',
  containerTag: 'sm_project_default'
})
```

## 🔐 Security Notes

- GitHub tokens should have minimal required scopes
- SuperMemory stores data securely
- Browser MCPs operate in isolated contexts

---

**Summary:** 
- ✅ SuperMemory MCP: Working
- ✅ Browser MCPs: Available
- ⚠️ GitHub MCP: Needs authentication token
- 📦 Current repo: `21st-dev/1code` (with fork at `Tsukieomie/1code`)

**Next Steps:** Configure GitHub token to enable full GitHub API access through MCP.
