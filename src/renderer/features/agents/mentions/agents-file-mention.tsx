"use client"

import { cn } from "../../../lib/utils"
import { api } from "../../../lib/mock-api"
import { trpc } from "../../../lib/trpc"
import { keepPreviousData } from "@tanstack/react-query"
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  createElement,
  memo,
} from "react"
import { flushSync, createPortal } from "react-dom"
import { createRoot } from "react-dom/client"
import { useAtomValue } from "jotai"
import type { FileMentionOption } from "./agents-mentions-editor"
import { MENTION_PREFIXES } from "./agents-mentions-editor"
import { sessionInfoAtom } from "../../../lib/atoms"
import {
  FilesIcon,
  IconSpinner,
  SkillIcon,
  CustomAgentIcon,
  OriginalMCPIcon,
} from "../../../components/ui/icons"
import { ChevronRight } from "lucide-react"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "../../../components/ui/tooltip"

// Custom folder icon matching design
function FolderOpenIcon({ className }: { className?: string }) {
  return (
    <svg 
      xmlns="http://www.w3.org/2000/svg" 
      viewBox="0 0 24 24" 
      fill="none"
      className={className}
    >
      <path 
        d="M4 8V6C4 4.89543 4.89543 4 6 4H14C15.1046 4 16 4.89543 16 6M4 8H8.17548C8.70591 8 9.21462 8.21071 9.58969 8.58579L11.4181 10.4142C11.7932 10.7893 12.3019 11 12.8323 11H16M4 8C3.44987 8 3.00391 8.44597 3.00391 8.99609V18C3.00391 19.1046 3.89934 20 5.00391 20H19.0039C20.1085 20 21.0039 19.1046 21.0039 18V12.0039C21.0039 11.4495 20.5544 11 20 11M16 11V6M16 11H20M16 6H18C19.1046 6 20 6.89543 20 8V11" 
        stroke="currentColor" 
        strokeWidth="2" 
        strokeLinejoin="round"
      />
    </svg>
  )
}
import {
  TypeScriptIcon,
  JavaScriptIcon,
  PythonIcon,
  GoIcon,
  RustIcon,
  CodeIcon,
  ReactIcon,
  MarkdownInfoIcon,
  MarkdownIcon,
  CSSIcon,
  HTMLIcon,
  SCSSIcon,
  JSONIcon,
  YAMLIcon,
  ShellIcon,
  SQLIcon,
  GraphQLIcon,
  PrismaIcon,
  DockerIcon,
  TOMLIcon,
  JavaIcon,
  CIcon,
  CppIcon,
  CSharpIcon,
  PHPIcon,
  RubyIcon,
  KotlinIcon,
  VueIcon,
  SvelteIcon,
  AstroIcon,
  SwiftIcon,
  PDFIcon,
  SVGIcon,
  TxtIcon,
  GitIcon,
  NpmIcon,
} from "../../../icons/framework-icons"

interface ChangedFile {
  filePath: string
  displayPath: string
  additions: number
  deletions: number
}

interface AgentsFileMentionProps {
  isOpen: boolean
  onClose: () => void
  onSelect: (mention: FileMentionOption) => void
  searchText: string
  position: { top: number; left: number }
  teamId?: string
  repository?: string
  sandboxId?: string
  branch?: string // For fetching files from specific branch via GitHub API
  projectPath?: string // For fetching files from local project directory (desktop)
  changedFiles?: ChangedFile[] // Files changed in current sub-chat (shown at top)
  // Subpage navigation state
  showingFilesList?: boolean
  showingSkillsList?: boolean
  showingAgentsList?: boolean
  showingToolsList?: boolean
}

// Category navigation options (shown on root view)
const CATEGORY_OPTIONS: FileMentionOption[] = [
  { id: "files", label: "Files & Folders", type: "category", path: "", repository: "" },
  { id: "skills", label: "Skills", type: "category", path: "", repository: "" },
  { id: "agents", label: "Agents", type: "category", path: "", repository: "" },
  { id: "tools", label: "MCP", type: "category", path: "", repository: "" },
]

// Known file extensions with icons
const KNOWN_FILE_ICON_EXTENSIONS = new Set([
  "tsx",
  "ts",
  "js",
  "mjs",
  "cjs",
  "jsx",
  "py",
  "pyw",
  "pyi",
  "go",
  "rs",
  "md",
  "mdx",
  "css",
  "html",
  "htm",
  "scss",
  "sass",
  "json",
  "jsonc",
  "yaml",
  "yml",
  "sh",
  "bash",
  "zsh",
  "sql",
  "graphql",
  "gql",
  "prisma",
  "dockerfile",
  "toml",
  "env",
  "java",
  "c",
  "h",
  "cpp",
  "cc",
  "cxx",
  "hpp",
  "cs",
  "php",
  "rb",
  "kt",
  "vue",
  "svelte",
  "astro",
  "swift",
  "pdf",
  "svg",
  "txt",
])

// Get file icon component based on file extension
// If returnNullForUnknown is true, returns null for unknown file types instead of default icon
export function getFileIconByExtension(
  filename: string,
  returnNullForUnknown = false,
) {
  const filenameLower = filename.toLowerCase()

  // Special handling for files without extensions (like Dockerfile)
  if (filenameLower === "dockerfile" || filenameLower.endsWith("/dockerfile")) {
    return DockerIcon
  }

  // Special handling for dotfiles
  const baseFilename = filenameLower.split("/").pop() || filenameLower
  if (baseFilename === ".gitignore") {
    return GitIcon
  }
  if (baseFilename === ".npmrc") {
    return NpmIcon
  }
  if (baseFilename === ".prettierrc") {
    return JSONIcon
  }

  // Special handling for .env files
  // .env (without suffix) -> TOML icon
  // .env.local, .env.example, .env.development, etc. -> Shell icon
  if (baseFilename === ".env") {
    return TOMLIcon
  }
  if (baseFilename.startsWith(".env.")) {
    // .env.local, .env.example, .env.development, etc.
    return ShellIcon
  }

  // Special handling for markdown files
  // README files -> MarkdownInfoIcon (with exclamation mark)
  // Other .md/.mdx files -> MarkdownIcon (standard markdown icon)
  if (filenameLower.endsWith(".md") || filenameLower.endsWith(".mdx")) {
    const nameWithoutExt = filenameLower.replace(/\.(md|mdx)$/, "")
    if (nameWithoutExt === "readme") {
      return MarkdownInfoIcon
    }
    return MarkdownIcon
  }

  // Special handling for JavaScript files
  // Ensure .js/.mjs/.cjs files use JavaScriptIcon, not JSONIcon
  if (
    filenameLower.endsWith(".js") ||
    filenameLower.endsWith(".mjs") ||
    filenameLower.endsWith(".cjs")
  ) {
    return JavaScriptIcon
  }

  const ext = filename.split(".").pop()?.toLowerCase() || ""

  switch (ext) {
    case "tsx":
      return ReactIcon
    case "ts":
      return TypeScriptIcon
    case "js":
    case "mjs":
    case "cjs":
      return JavaScriptIcon
    case "jsx":
      return ReactIcon
    case "py":
    case "pyw":
    case "pyi":
      return PythonIcon
    case "go":
      return GoIcon
    case "rs":
      return RustIcon
    case "md":
    case "mdx":
      // This case is handled above in special handling, but kept as fallback
      // Check if it's README
      const nameWithoutExt = filenameLower.replace(/\.(md|mdx)$/, "")
      if (nameWithoutExt === "readme") {
        return MarkdownInfoIcon
      }
      return MarkdownIcon
    case "css":
      return CSSIcon
    case "html":
    case "htm":
      return HTMLIcon
    case "scss":
    case "sass":
      return SCSSIcon
    case "json":
    case "jsonc":
      return JSONIcon
    case "yaml":
    case "yml":
      return YAMLIcon
    case "sh":
    case "bash":
    case "zsh":
      return ShellIcon
    case "sql":
      return SQLIcon
    case "graphql":
    case "gql":
      return GraphQLIcon
    case "prisma":
      return PrismaIcon
    case "dockerfile":
      return DockerIcon
    case "toml":
      return TOMLIcon
    case "env":
      // This handles .env files, but we already handled them above
      // This is a fallback for edge cases
      return TOMLIcon
    case "java":
      return JavaIcon
    case "c":
    case "h":
      return CIcon
    case "cpp":
    case "cc":
    case "cxx":
    case "hpp":
      return CppIcon
    case "cs":
      return CSharpIcon
    case "php":
      return PHPIcon
    case "rb":
      return RubyIcon
    case "kt":
      return KotlinIcon
    case "vue":
      return VueIcon
    case "svelte":
      return SvelteIcon
    case "astro":
      return AstroIcon
    case "swift":
      return SwiftIcon
    case "pdf":
      return PDFIcon
    case "svg":
      return SVGIcon
    case "txt":
      return TxtIcon
    default:
      return returnNullForUnknown ? null : FilesIcon
  }
}

// Tool icon component (MCP icon) - slightly larger for visibility
function ToolIcon({ className }: { className?: string }) {
  // Override size to h-3.5 w-3.5 for better visibility
  const sizeClass = className?.replace(/h-3\b/, "h-3.5").replace(/w-3\b/, "w-3.5") || className
  return <OriginalMCPIcon className={sizeClass} />
}

/**
 * Create MCP icon SVG element directly via DOM API (avoids flushSync issues)
 */
function createMCPIconElement(): SVGSVGElement {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg")
  svg.setAttribute("viewBox", "0 0 24 24")
  svg.setAttribute("fill", "none")
  svg.className.baseVal = "h-3 w-3 text-muted-foreground flex-shrink-0"

  const path1 = document.createElementNS("http://www.w3.org/2000/svg", "path")
  path1.setAttribute("fill-rule", "evenodd")
  path1.setAttribute("clip-rule", "evenodd")
  path1.setAttribute("d", "M15.0915 3.8956C14.6865 3.50142 14.1437 3.28087 13.5785 3.28087C13.0133 3.28087 12.4705 3.50142 12.0655 3.8956L3.9966 11.8086C3.86157 11.9398 3.6807 12.0132 3.4924 12.0132C3.3041 12.0132 3.12322 11.9398 2.9882 11.8086C2.92209 11.7443 2.86955 11.6674 2.83366 11.5824C2.79778 11.4975 2.7793 11.4062 2.7793 11.314C2.7793 11.2218 2.79778 11.1305 2.83366 11.0456C2.86955 10.9606 2.92209 10.8837 2.9882 10.8194L11.0571 2.90647C11.732 2.24962 12.6367 1.8821 13.5785 1.8821C14.5203 1.8821 15.425 2.24962 16.0999 2.90647C16.4905 3.28628 16.7855 3.75318 16.961 4.26894C17.1364 4.7847 17.1872 5.33467 17.1092 5.87384C17.6555 5.79614 18.2124 5.84491 18.7369 6.0164C19.2614 6.18789 19.7395 6.47752 20.1344 6.86296L20.1763 6.90487C20.5068 7.22632 20.7695 7.61077 20.949 8.0355C21.1284 8.46023 21.2208 8.91661 21.2208 9.37768C21.2208 9.83874 21.1284 10.2951 20.949 10.7199C20.7695 11.1446 20.5068 11.529 20.1763 11.8505L12.8786 19.0065C12.8565 19.0279 12.839 19.0535 12.8271 19.0818C12.8151 19.1101 12.809 19.1405 12.809 19.1712C12.809 19.202 12.8151 19.2324 12.8271 19.2606C12.839 19.2889 12.8565 19.3145 12.8786 19.336L14.3773 20.8062C14.4435 20.8705 14.496 20.9474 14.5319 21.0323C14.5678 21.1173 14.5862 21.2086 14.5862 21.3008C14.5862 21.393 14.5678 21.4843 14.5319 21.5692C14.496 21.6542 14.4435 21.7311 14.3773 21.7953C14.2423 21.9266 14.0614 22 13.8731 22C13.6848 22 13.504 21.9266 13.3689 21.7953L11.8702 20.3259C11.7158 20.1759 11.5931 19.9965 11.5093 19.7982C11.4255 19.6 11.3823 19.3869 11.3823 19.1717C11.3823 18.9564 11.4255 18.7434 11.5093 18.5451C11.5931 18.3468 11.7158 18.1674 11.8702 18.0174L19.1679 10.8605C19.3661 10.6676 19.5236 10.4369 19.6312 10.1821C19.7388 9.92724 19.7942 9.65344 19.7942 9.37684C19.7942 9.10023 19.7388 8.82643 19.6312 8.5716C19.5236 8.31677 19.3661 8.08608 19.1679 7.89316L19.126 7.85208C18.7214 7.45833 18.1793 7.23779 17.6147 7.23732C17.0502 7.23685 16.5077 7.45648 16.1024 7.84957L10.0906 13.7457L10.0889 13.7474L10.0068 13.8287C9.87171 13.9602 9.69065 14.0338 9.50215 14.0338C9.31365 14.0338 9.1326 13.9602 8.99753 13.8287C8.93142 13.7644 8.87888 13.6875 8.843 13.6026C8.80712 13.5177 8.78863 13.4264 8.78863 13.3342C8.78863 13.2419 8.80712 13.1507 8.843 13.0657C8.87888 12.9808 8.93142 12.9039 8.99753 12.8396L15.094 6.86045C15.2917 6.66739 15.4487 6.43672 15.5559 6.18203C15.663 5.92735 15.7181 5.65379 15.7178 5.37749C15.7176 5.10119 15.6621 4.82773 15.5545 4.57322C15.4469 4.31872 15.2895 4.08832 15.0915 3.8956Z")
  path1.setAttribute("fill", "currentColor")
  svg.appendChild(path1)

  const path2 = document.createElementNS("http://www.w3.org/2000/svg", "path")
  path2.setAttribute("fill-rule", "evenodd")
  path2.setAttribute("clip-rule", "evenodd")
  path2.setAttribute("d", "M14.0817 5.87383C14.1478 5.80954 14.2004 5.73265 14.2362 5.64771C14.2721 5.56276 14.2906 5.47148 14.2906 5.37927C14.2906 5.28706 14.2721 5.19578 14.2362 5.11084C14.2004 5.02589 14.1478 4.949 14.0817 4.88471C13.9467 4.75322 13.7656 4.67964 13.5771 4.67964C13.3886 4.67964 13.2075 4.75322 13.0725 4.88471L7.10506 10.7373C6.77452 11.0587 6.51179 11.4432 6.33239 11.8679C6.15298 12.2926 6.06055 12.749 6.06055 13.2101C6.06055 13.6712 6.15298 14.1275 6.33239 14.5523C6.51179 14.977 6.77452 15.3615 7.10506 15.6829C7.78012 16.3396 8.68472 16.7069 9.62648 16.7069C10.5682 16.7069 11.4728 16.3396 12.1479 15.6829L18.1162 9.83032C18.1823 9.76603 18.2348 9.68914 18.2707 9.60419C18.3066 9.51925 18.3251 9.42797 18.3251 9.33576C18.3251 9.24355 18.3066 9.15227 18.2707 9.06732C18.2348 8.98238 18.1823 8.90549 18.1162 8.8412C17.9811 8.70971 17.8 8.63613 17.6115 8.63613C17.423 8.63613 17.242 8.70971 17.1069 8.8412L11.1395 14.6938C10.7345 15.088 10.1916 15.3085 9.62648 15.3085C9.06132 15.3085 8.51847 15.088 8.11346 14.6938C7.91524 14.5009 7.75769 14.2702 7.65012 14.0153C7.54254 13.7605 7.48712 13.4867 7.48712 13.2101C7.48712 12.9335 7.54254 12.6597 7.65012 12.4049C7.75769 12.15 7.91524 11.9193 8.11346 11.7264L14.0817 5.87383Z")
  path2.setAttribute("fill", "currentColor")
  svg.appendChild(path2)

  return svg
}

// Create SVG icon element in DOM based on file extension or type
export function createFileIconElement(filename: string, type?: "file" | "folder" | "skill" | "agent" | "category" | "tool"): SVGSVGElement {
  // Tool type: create MCP icon directly via DOM API (flushSync is unreliable for this icon)
  if (type === "tool") {
    return createMCPIconElement()
  }

  const IconComponent = type === "skill"
    ? SkillIcon
    : type === "agent"
      ? CustomAgentIcon
    : type === "folder"
      ? FolderOpenIcon
      : (getFileIconByExtension(filename) ?? FilesIcon)
  // Note: "category" type will use the default file icon based on filename, which is fine since
  // categories won't be inserted as mentions in the editor (they navigate to subpages)

  // Create a temporary container
  const container = document.createElement("div")
  container.style.display = "none"
  container.style.position = "absolute"
  container.style.visibility = "hidden"
  document.body.appendChild(container)

  // Create React element
  const iconElement = createElement(IconComponent, {
    className: "h-3 w-3 text-muted-foreground flex-shrink-0",
  })

  const root = createRoot(container)

  // Render synchronously using flushSync
  flushSync(() => {
    root.render(iconElement)
  })

  // Extract the SVG element
  const svgElement = container.querySelector("svg")

  // Clean up
  root.unmount()
  if (container.parentNode) {
    document.body.removeChild(container)
  }

  if (!svgElement || !(svgElement instanceof SVGSVGElement)) {
    // Fallback: create a simple file icon
    const fallbackSvg = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "svg",
    )
    fallbackSvg.setAttribute("width", "12")
    fallbackSvg.setAttribute("height", "12")
    fallbackSvg.setAttribute("viewBox", "0 0 24 24")
    fallbackSvg.setAttribute("fill", "none")
    fallbackSvg.setAttribute("stroke", "currentColor")
    fallbackSvg.setAttribute("stroke-width", "2")
    fallbackSvg.setAttribute("stroke-linecap", "round")
    fallbackSvg.setAttribute("stroke-linejoin", "round")
    fallbackSvg.className.baseVal =
      "h-3 w-3 text-muted-foreground flex-shrink-0"

    const path = document.createElementNS("http://www.w3.org/2000/svg", "path")
    path.setAttribute(
      "d",
      "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z",
    )
    fallbackSvg.appendChild(path)

    const polyline = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "polyline",
    )
    polyline.setAttribute("points", "14 2 14 8 20 8")
    fallbackSvg.appendChild(polyline)

    return fallbackSvg
  }

  // Clone the SVG to avoid issues
  const clonedSvg = svgElement.cloneNode(true) as SVGSVGElement
  clonedSvg.setAttribute("class", "h-3 w-3 text-muted-foreground flex-shrink-0")

  return clonedSvg
}

// Folder icon component for consistency with file icons
function FolderIcon({ className }: { className?: string }) {
  return <FolderOpenIcon className={className} />
}

// Skill icon component (local wrapper for getOptionIcon)
function SkillIconWrapper({ className }: { className?: string }) {
  return <SkillIcon className={className} />
}

function CustomAgentIconWrapper({ className }: { className?: string }) {
  return <CustomAgentIcon className={className} />
}

// ToolIconWrapper removed - use ToolIcon instead (they were identical)

// Category icon component
function CategoryIcon({ className, categoryId }: { className?: string; categoryId: string }) {
  if (categoryId === "files") {
    return <FilesIcon className={className} />
  }
  if (categoryId === "skills") {
    return <SkillIcon className={className} />
  }
  if (categoryId === "agents") {
    return <CustomAgentIcon className={className} />
  }
  if (categoryId === "tools") {
    // Override size to h-3.5 w-3.5 for better visibility
    const sizeClass = className?.replace(/h-3\b/, "h-3.5").replace(/w-3\b/, "w-3.5") || className
    return <OriginalMCPIcon className={sizeClass} />
  }
  return <FilesIcon className={className} />
}

/**
 * Get icon component for a file, folder, skill, agent, tool, or category option
 */
export function getOptionIcon(option: { id?: string; label: string; type?: "file" | "folder" | "skill" | "agent" | "category" | "tool" }) {
  if (option.type === "category") {
    // Return a wrapper component for categories
    return function CategoryIconWrapper({ className }: { className?: string }) {
      return <CategoryIcon className={className} categoryId={option.id || ""} />
    }
  }
  if (option.type === "skill") {
    return SkillIconWrapper
  }
  if (option.type === "agent") {
    return CustomAgentIconWrapper
  }
  if (option.type === "tool") {
    return ToolIcon
  }
  if (option.type === "folder") {
    return FolderIcon
  }
  return getFileIconByExtension(option.label) ?? FilesIcon
}

/**
 * Render folder path as a tree structure for tooltip
 * e.g., "apps/web/app" becomes:
 *   📁 apps
 *     📁 web
 *       📁 app
 */
function renderFolderTree(path: string) {
  const parts = path.split("/").filter(Boolean)
  const lastIndex = parts.length - 1
  return (
    <div className="flex flex-col gap-1 min-w-[220px]">
      {parts.map((part, index) => {
        const isLast = index === lastIndex
        return (
          <div
            key={index}
            className={cn(
              "flex items-center gap-1.5 text-xs",
              isLast ? "text-foreground" : "text-muted-foreground"
            )}
            style={{ paddingLeft: `${index * 20}px` }}
          >
            <FolderOpenIcon className={cn(
              "h-3.5 w-3.5 flex-shrink-0",
              isLast ? "text-foreground/70" : "text-muted-foreground"
            )} />
            <span className={isLast ? "font-medium" : ""}>{part}</span>
          </div>
        )
      })}
    </div>
  )
}

/**
 * Check if a string matches all search words (multi-word search)
 * Splits search by whitespace, all words must be present in target
 */
function matchesMultiWordSearch(target: string, searchLower: string): boolean {
  if (!searchLower) return true
  const searchWords = searchLower.split(/\s+/).filter(Boolean)
  if (searchWords.length === 0) return true
  const targetLower = target.toLowerCase()
  return searchWords.every(word => targetLower.includes(word))
}

/**
 * Sort files by relevance to search query
 * Priority: exact match > starts with > shorter match > contains in filename > alphabetical
 * Supports multi-word search - splits by whitespace, all words must match
 * When search ends with space, prioritize files with hyphen/underscore (e.g. "agents " -> "agents-sidebar")
 */
function sortFilesByRelevance<T extends { label: string; path?: string }>(
  files: T[],
  searchText: string,
): T[] {
  if (!searchText) return files

  const searchLower = searchText.toLowerCase()
  const searchWords = searchLower.split(/\s+/).filter(Boolean)
  const isSingleWord = searchWords.length <= 1
  // Check if search ends with space - user wants to continue with hyphenated names
  const endsWithSpace = searchText.endsWith(" ")

  return [...files].sort((a, b) => {
    const aLabelLower = a.label.toLowerCase()
    const bLabelLower = b.label.toLowerCase()

    // Get filename without extension for matching
    const aNameNoExt = aLabelLower.replace(/\.[^.]+$/, "")
    const bNameNoExt = bLabelLower.replace(/\.[^.]+$/, "")

    // For multi-word search, prioritize files where all words match in filename
    if (!isSingleWord) {
      const aAllInFilename = searchWords.every(w => aLabelLower.includes(w))
      const bAllInFilename = searchWords.every(w => bLabelLower.includes(w))
      if (aAllInFilename && !bAllInFilename) return -1
      if (!aAllInFilename && bAllInFilename) return 1
    }

    // When search ends with space, prioritize files with hyphen/underscore after first word
    // e.g. "agents " should show "agents-sidebar" before "agents" folder
    if (endsWithSpace && searchWords.length >= 1) {
      const lastWord = searchWords[searchWords.length - 1]
      // Check if filename has hyphen/underscore continuation after matching word
      const aHasContinuation = aNameNoExt.includes(`${lastWord}-`) || aNameNoExt.includes(`${lastWord}_`)
      const bHasContinuation = bNameNoExt.includes(`${lastWord}-`) || bNameNoExt.includes(`${lastWord}_`)
      if (aHasContinuation && !bHasContinuation) return -1
      if (!aHasContinuation && bHasContinuation) return 1
    }

    // Priority 1: EXACT match (chat.tsx when searching "chat") - single word only, not when ending with space
    if (isSingleWord && !endsWithSpace) {
      const aExact = aNameNoExt === searchLower
      const bExact = bNameNoExt === searchLower
      if (aExact && !bExact) return -1
      if (!aExact && bExact) return 1
    }

    // Priority 2: filename STARTS with first search word
    const firstWord = searchWords[0] || searchLower
    const aStartsWith = aNameNoExt.startsWith(firstWord)
    const bStartsWith = bNameNoExt.startsWith(firstWord)
    if (aStartsWith && !bStartsWith) return -1
    if (!aStartsWith && bStartsWith) return 1

    // Priority 3: If both start with query, shorter name = higher match %
    // But when ending with space, prefer longer (hyphenated) names
    if (aStartsWith && bStartsWith) {
      if (aNameNoExt.length !== bNameNoExt.length) {
        if (endsWithSpace) {
          return bNameNoExt.length - aNameNoExt.length // longer first when space at end
        }
        return aNameNoExt.length - bNameNoExt.length // shorter first normally
      }
    }

    // Priority 4: filename CONTAINS first word (but doesn't start with it)
    const aFilenameMatch = aLabelLower.includes(firstWord)
    const bFilenameMatch = bLabelLower.includes(firstWord)
    if (aFilenameMatch && !bFilenameMatch) return -1
    if (!aFilenameMatch && bFilenameMatch) return 1

    // Finally: alphabetically by label
    return a.label.localeCompare(b.label)
  })
}

/**
 * Render tooltip content for a mention option
 * Skills/agents show description, tools, model info
 * Tools show MCP server name
 * Files/folders show path
 */
function renderTooltipContent(option: FileMentionOption) {
  if (option.type === "folder") {
    return renderFolderTree(option.path)
  }

  if (option.type === "skill" || option.type === "agent") {
    return (
      <div className="flex flex-col gap-1.5 w-full overflow-hidden">
        {option.description && (
          <p className="text-xs text-muted-foreground break-words">
            {option.description}
          </p>
        )}
        {option.model && (
          <div className="text-xs text-muted-foreground">
            Model: {option.model}
          </div>
        )}
        {option.tools && option.tools.length > 0 && (
          <div className="text-xs text-muted-foreground break-words">
            Tools: {option.tools.join(", ")}
          </div>
        )}
        <div className="text-[10px] text-muted-foreground/70 font-mono truncate w-full">
          {option.path}
        </div>
      </div>
    )
  }

  if (option.type === "tool") {
    return null
  }

  // Files - just path
  return (
    <div className="text-xs text-muted-foreground font-mono truncate w-full">
      {option.path}
    </div>
  )
}

// Memoized to prevent re-renders when parent re-renders
export const AgentsFileMention = memo(function AgentsFileMention({
  isOpen,
  onClose,
  onSelect,
  searchText,
  position,
  teamId,
  repository,
  sandboxId,
  branch,
  projectPath,
  changedFiles = [],
  showingFilesList = false,
  showingSkillsList = false,
  showingAgentsList = false,
  showingToolsList = false,
}: AgentsFileMentionProps) {
  const dropdownRef = useRef<HTMLDivElement>(null)
  const [selectedIndex, setSelectedIndex] = useState(0)
  const placementRef = useRef<"above" | "below" | null>(null)
  const [debouncedSearchText, setDebouncedSearchText] = useState(searchText)

  const [hoverIndex, setHoverIndex] = useState<number | null>(null)

  // Get session info (MCP servers, tools) from atom
  const sessionInfo = useAtomValue(sessionInfoAtom)

  // Fetch skills from filesystem (cached for 5 minutes)
  const { data: skills = [], isFetching: isFetchingSkills } = trpc.skills.listEnabled.useQuery(
    projectPath ? { cwd: projectPath } : undefined,
    {
      enabled: isOpen,
      staleTime: 5 * 60 * 1000, // 5 minutes - skills don't change frequently
    },
  )

  // Fetch custom agents from filesystem (cached for 5 minutes)
  const { data: customAgents = [], isFetching: isFetchingAgents } = trpc.agents.listEnabled.useQuery(
    projectPath ? { cwd: projectPath } : undefined,
    {
      enabled: isOpen,
      staleTime: 5 * 60 * 1000, // 5 minutes - agents don't change frequently
    },
  )

  // Debounce search text (300ms to match canvas implementation)
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchText(searchText)
    }, 300)
    return () => clearTimeout(timer)
  }, [searchText])

  // For multi-word search, send only first word to API (server filters by that),
  // then filter results on client by all words
  const apiSearchQuery = useMemo(() => {
    if (!debouncedSearchText) return ""
    const words = debouncedSearchText.split(/\s+/).filter(Boolean)
    return words[0] || ""
  }, [debouncedSearchText])

  // Fetch files from API
  // Priority: sandboxId (includes uncommitted) > branch (GitHub API) > cached file_tree
  const {
    data: fileResults = [],
    isLoading,
    isFetching,
    error,
  } = api.github.searchFiles.useQuery(
    {
      teamId: teamId!,
      repository: repository!,
      query: apiSearchQuery,
      limit: 50,
      sandboxId: sandboxId,
      branch: branch, // Pass branch for GitHub API fetch
      projectPath: projectPath, // For local project file search (desktop)
    },
    {
      // Enable if we have projectPath (desktop) OR teamId with repository/sandboxId/branch (web)
      enabled: isOpen && (!!projectPath || (!!teamId && (!!repository || !!sandboxId || !!branch))),
      staleTime: 5000,
      refetchOnWindowFocus: false,
      // Keep showing previous results while fetching new ones
      placeholderData: keepPreviousData,
    },
  )
  // Convert changed files to options (shown at top in separate group)
  const changedFileOptions: FileMentionOption[] = useMemo(() => {
    if (!changedFiles.length) return []

    const searchLower = debouncedSearchText.toLowerCase()

    const mapped = changedFiles
      .filter((file) =>
        // Multi-word search: all words must match in file path
        matchesMultiWordSearch(file.filePath, searchLower),
      )
      .map((file) => {
        // Use displayPath (relative path) for UI display, filePath only for internal ID
        const displayPath = file.displayPath || file.filePath
        const pathParts = displayPath.split("/")
        const fileName = pathParts.pop() || displayPath
        const dirPath = pathParts.join("/") || "/"

        return {
          id: `changed:${file.filePath}`,
          label: fileName,
          path: displayPath,
          repository: repository || "",
          truncatedPath: dirPath,
          additions: file.additions,
          deletions: file.deletions,
        }
      })

    // Sort by relevance using shared function
    return sortFilesByRelevance(mapped, debouncedSearchText)
  }, [changedFiles, debouncedSearchText, repository])

  // Convert API results to options with truncated path
  // Exclude files that are already in changedFileOptions
  const changedFilePaths = useMemo(
    () => new Set(changedFiles.map((f) => f.filePath)),
    [changedFiles],
  )

  const repoFileOptions: FileMentionOption[] = useMemo(() => {
    const searchLower = debouncedSearchText.toLowerCase()

    const mapped = fileResults
      .filter((file) => !changedFilePaths.has(file.path))
      // Client-side multi-word filtering (API only filtered by first word)
      .filter((file) => matchesMultiWordSearch(file.path, searchLower))
      .map((file) => {
        // Get directory path (without filename/foldername) for inline display
        const pathParts = file.path.split("/")
        const dirPath = pathParts.slice(0, -1).join("/") || "/"

        return {
          id: file.id,
          label: file.label,
          path: file.path,
          repository: file.repository,
          truncatedPath: dirPath,
          type: (file as { type?: "file" | "folder" }).type,
        }
      })

    // Sort by relevance using shared function
    return sortFilesByRelevance(mapped, debouncedSearchText)
  }, [fileResults, changedFilePaths, debouncedSearchText])

  // Convert skills to mention options
  const skillOptions: FileMentionOption[] = useMemo(() => {
    const searchLower = debouncedSearchText.toLowerCase()

    return skills
      .filter(skill =>
        // Multi-word search: all words must match in name OR description
        matchesMultiWordSearch(skill.name, searchLower) ||
        matchesMultiWordSearch(skill.description, searchLower)
      )
      .map(skill => ({
        id: `${MENTION_PREFIXES.SKILL}${skill.name}`,
        label: skill.name,
        path: skill.path, // file path for tooltip
        repository: "",
        truncatedPath: skill.description,
        type: "skill" as const,
        // Extended data for rich tooltip
        description: skill.description,
        source: skill.source,
      }))
  }, [skills, debouncedSearchText])

  // Convert custom agents to mention options
  const agentOptions: FileMentionOption[] = useMemo(() => {
    const searchLower = debouncedSearchText.toLowerCase()

    return customAgents
      .filter(agent =>
        // Multi-word search: all words must match in name OR description
        matchesMultiWordSearch(agent.name, searchLower) ||
        matchesMultiWordSearch(agent.description, searchLower)
      )
      .map(agent => ({
        id: `${MENTION_PREFIXES.AGENT}${agent.name}`,
        label: agent.name,
        path: agent.path, // file path for tooltip
        repository: "",
        truncatedPath: agent.description,
        type: "agent" as const,
        // Extended data for rich tooltip
        description: agent.description,
        tools: agent.tools,
        model: agent.model,
        source: agent.source,
      }))
  }, [customAgents, debouncedSearchText])

  // Convert MCP servers to mention options (show servers, not individual tools)
  const allToolOptions: FileMentionOption[] = useMemo(() => {
    if (!sessionInfo?.mcpServers) return []

    const connectedServers = sessionInfo.mcpServers
      .filter(s => s.status === "connected")

    return connectedServers.map(server => ({
      id: `${MENTION_PREFIXES.TOOL}${server.name}`,
      label: server.name,
      path: server.name,
      repository: "",
      truncatedPath: "",
      type: "tool" as const,
      mcpServer: server.name,
    }))
  }, [sessionInfo])

  // Filtered tool options based on search (searches by server name)
  const toolOptions: FileMentionOption[] = useMemo(() => {
    if (!debouncedSearchText) return allToolOptions

    const searchLower = debouncedSearchText.toLowerCase()
    return allToolOptions.filter(tool => {
      return matchesMultiWordSearch(tool.label, searchLower)
    })
  }, [allToolOptions, debouncedSearchText])

  // Check if we have skills, agents, or tools
  // Use base data (not search-filtered) for stable category display
  const hasSkills = skills.length > 0
  const hasAgents = customAgents.length > 0
  const hasTools = allToolOptions.length > 0
  const hasOnlyFiles = !hasSkills && !hasAgents && !hasTools

  // Determine if we're in a subpage view (or showing files directly when no skills/agents/tools)
  const isInSubpage = showingFilesList || showingSkillsList || showingAgentsList || showingToolsList || hasOnlyFiles

  // Filter category options based on available data
  const availableCategoryOptions = useMemo(() => {
    return CATEGORY_OPTIONS.filter(category => {
      if (category.id === "files") return true // Always show files
      if (category.id === "skills") return hasSkills
      if (category.id === "agents") return hasAgents
      if (category.id === "tools") return hasTools
      return true
    })
  }, [hasSkills, hasAgents, hasTools])

  // Combined options for keyboard navigation
  // Subpage views show only that category's items
  // Root view shows changed files + category navigation options
  // Search filters globally in root view, within category in subpage
  // If no skills, agents, or tools, skip root view and show files directly
  const options: FileMentionOption[] = useMemo(() => {
    // SUBPAGE: Files (or if no skills/agents/tools, show files directly)
    if (showingFilesList || hasOnlyFiles) {
      const allFiles = [...changedFileOptions, ...repoFileOptions]
      if (debouncedSearchText) {
        return sortFilesByRelevance(allFiles, debouncedSearchText)
      }
      return allFiles
    }

    // SUBPAGE: Skills
    if (showingSkillsList) {
      return skillOptions // already filtered by search in skillOptions memo
    }

    // SUBPAGE: Agents
    if (showingAgentsList) {
      return agentOptions // already filtered by search in agentOptions memo
    }

    // SUBPAGE: MCP Tools
    if (showingToolsList) {
      return toolOptions // already filtered by search in toolOptions memo
    }

    // ROOT VIEW
    if (debouncedSearchText) {
      // Global search: search across changed files + categories + skills + agents + tools + repo files
      const searchLower = debouncedSearchText.toLowerCase()
      const filteredCategories = availableCategoryOptions.filter(c =>
        c.label.toLowerCase().includes(searchLower)
      )
      const allItems = [...changedFileOptions, ...filteredCategories, ...skillOptions, ...agentOptions, ...toolOptions, ...repoFileOptions]
      return sortFilesByRelevance(allItems, debouncedSearchText)
    }

    // No search: Changed files FIRST (quick access), then category navigation
    return [...changedFileOptions, ...availableCategoryOptions]
  }, [showingFilesList, showingSkillsList, showingAgentsList, showingToolsList, debouncedSearchText, changedFileOptions, repoFileOptions, skillOptions, agentOptions, toolOptions, hasOnlyFiles, availableCategoryOptions])

  // Track previous values for smarter selection reset
  const prevIsOpenRef = useRef(isOpen)
  const prevSearchRef = useRef(debouncedSearchText)
  const prevShowingFilesListRef = useRef(showingFilesList)
  const prevShowingSkillsListRef = useRef(showingSkillsList)
  const prevShowingAgentsListRef = useRef(showingAgentsList)
  const prevShowingToolsListRef = useRef(showingToolsList)

  // CONSOLIDATED: Single useLayoutEffect for selection management (was 3 separate)
  useLayoutEffect(() => {
    const didJustOpen = isOpen && !prevIsOpenRef.current
    const didSearchChange = debouncedSearchText !== prevSearchRef.current
    const didSubpageChange =
      showingFilesList !== prevShowingFilesListRef.current ||
      showingSkillsList !== prevShowingSkillsListRef.current ||
      showingAgentsList !== prevShowingAgentsListRef.current ||
      showingToolsList !== prevShowingToolsListRef.current

    // Reset to 0 when opening, search changes, or subpage changes
    if (didJustOpen || didSearchChange || didSubpageChange) {
      setSelectedIndex(0)
    }
    // Clamp to valid range if options shrunk
    else if (options.length > 0 && selectedIndex >= options.length) {
      setSelectedIndex(Math.max(0, options.length - 1))
    }

    // Update refs
    prevIsOpenRef.current = isOpen
    prevSearchRef.current = debouncedSearchText
    prevShowingFilesListRef.current = showingFilesList
    prevShowingSkillsListRef.current = showingSkillsList
    prevShowingAgentsListRef.current = showingAgentsList
    prevShowingToolsListRef.current = showingToolsList
  }, [isOpen, debouncedSearchText, options.length, selectedIndex, showingFilesList, showingSkillsList, showingAgentsList, showingToolsList])

  // Reset placement when closed
  useEffect(() => {
    if (!isOpen) {
      placementRef.current = null
    }
  }, [isOpen])

  // Keyboard navigation
  useEffect(() => {
    if (!isOpen) return

    const handleKeyDown = (e: KeyboardEvent) => {
      switch (e.key) {
        case "ArrowDown":
          e.preventDefault()
          e.stopPropagation()
          e.stopImmediatePropagation()
          setSelectedIndex((prev) => (prev + 1) % options.length)
          break
        case "ArrowUp":
          e.preventDefault()
          e.stopPropagation()
          e.stopImmediatePropagation()
          setSelectedIndex(
            (prev) => (prev - 1 + options.length) % options.length,
          )
          break
        case "Enter":
          if (e.shiftKey) return
          e.preventDefault()
          e.stopPropagation()
          e.stopImmediatePropagation()
          if (options[selectedIndex]) {
            onSelect(options[selectedIndex])
          }
          break
        case "Escape":
          e.preventDefault()
          e.stopPropagation()
          e.stopImmediatePropagation()
          onClose()
          break
      }
    }

    window.addEventListener("keydown", handleKeyDown, { capture: true })
    return () =>
      window.removeEventListener("keydown", handleKeyDown, { capture: true })
  }, [isOpen, options, selectedIndex, onSelect, onClose])

  // Auto-scroll selected item into view
  useEffect(() => {
    if (!isOpen || !dropdownRef.current) return

    // Account for header element
    const headerOffset = 1
    if (selectedIndex === 0) {
      dropdownRef.current.scrollTo({ top: 0, behavior: "auto" })
      return
    }

    const elements = dropdownRef.current.querySelectorAll("[data-option-index]")
    const selectedElement = elements[selectedIndex] as HTMLElement
    if (selectedElement) {
      selectedElement.scrollIntoView({ block: "nearest" })
    }
  }, [selectedIndex, isOpen])

  // Click outside
  useEffect(() => {
    if (!isOpen) return

    const handleClickOutside = (e: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node)
      ) {
        onClose()
      }
    }

    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [isOpen, onClose])

  if (!isOpen) return null

  // Calculate dropdown dimensions (matching canvas style)
  // Narrower dropdown when showing only categories (no changed files)
  const hasChangedFiles = changedFileOptions.length > 0
  const isRootView = !showingFilesList && !showingSkillsList && !showingAgentsList && !showingToolsList && !hasOnlyFiles
  // Narrow dropdown for root view (categories only) and skills/agents/tools subpages
  // Wide dropdown for files (showingFilesList or hasOnlyFiles)
  const useNarrowWidth = (isRootView && !hasChangedFiles && !debouncedSearchText) || showingSkillsList || showingAgentsList || showingToolsList
  const dropdownWidth = useNarrowWidth ? 200 : 320
  const itemHeight = 28
  const headerHeight = 28 // header with py-1.5 and text-xs
  // Only add header height when header is actually shown (in subpages or when searching)
  const showsHeader = !isRootView || !!debouncedSearchText
  const paddingHeight = 8 // py-1 on container = 4px top + 4px bottom
  const requestedHeight = Math.min(
    options.length * itemHeight + (showsHeader ? headerHeight : 0) + paddingHeight,
    200,
  )
  const gap = 8

  // Decide placement like Radix Popover (auto-flip top/bottom)
  const safeMargin = 10
  const lineHeight = 20 // approximate line height for better positioning
  const availableBelow =
    window.innerHeight - (position.top + lineHeight) - safeMargin
  const availableAbove = position.top - safeMargin

  // Compute desired placement, but lock it for the duration of the open state
  // Prefer above if there's more space above, or if below doesn't fit
  if (placementRef.current === null) {
    const condition1 =
      availableAbove >= requestedHeight && availableBelow < requestedHeight
    const condition2 =
      availableAbove > availableBelow && availableAbove >= requestedHeight
    const shouldPlaceAbove = condition1 || condition2
    placementRef.current = shouldPlaceAbove ? "above" : "below"
  }
  const placeAbove = placementRef.current === "above"

  // Compute final top based on placement
  // Use line height for better positioning relative to cursor
  let finalTop = placeAbove
    ? position.top - gap
    : position.top + lineHeight + gap

  // Position is already aligned to editor left edge, no offset needed
  let finalLeft = position.left


  // Adjust horizontal overflow
  if (finalLeft + dropdownWidth > window.innerWidth - safeMargin) {
    finalLeft = window.innerWidth - dropdownWidth - safeMargin
  }
  if (finalLeft < safeMargin) {
    finalLeft = safeMargin
  }

  // Compute actual maxHeight based on available space on the chosen side
  const computedMaxHeight = Math.max(
    80,
    Math.min(
      requestedHeight,
      placeAbove ? availableAbove - gap : availableBelow - gap,
    ),
  )
  const transformY = placeAbove ? "translateY(-100%)" : "translateY(0)"

  return createPortal(
    <TooltipProvider delayDuration={300}>
      <div
        ref={dropdownRef}
        className="fixed z-[99999] overflow-y-auto rounded-[10px] border border-border bg-popover py-1 text-xs text-popover-foreground shadow-lg dark [&::-webkit-scrollbar]:hidden"
        style={{
          top: finalTop,
          left: finalLeft,
          width: `${dropdownWidth}px`,
          maxHeight: `${computedMaxHeight}px`,
          transform: transformY,
          scrollbarWidth: 'none',
          msOverflowStyle: 'none',
        } as React.CSSProperties}
      >
        {/* Initial loading state (no previous data) */}
        {isLoading && options.length === 0 && (
          <div className="flex items-center gap-1.5 h-7 px-1.5 mx-1 text-xs text-muted-foreground">
            <IconSpinner className="h-3.5 w-3.5" />
            <span>Loading files...</span>
          </div>
        )}

        {/* Error state */}
        {error && (
          <div className="h-7 px-1.5 mx-1 flex items-center text-xs text-muted-foreground">
            Error loading files
          </div>
        )}

        {/* Empty state (only show when not fetching) */}
        {!isLoading && !isFetching && !error && options.length === 0 && (
          <div className="h-7 px-1.5 mx-1 flex items-center text-xs text-muted-foreground">
            {debouncedSearchText
              ? `No files matching "${debouncedSearchText}"`
              : "No files found"}
          </div>
        )}

        {/* File list */}
        {!isLoading && !error && options.length > 0 && (
          <>
            {/* Flat list sorted by relevance */}
            <>
              {/* Header - only show in subpages or when searching, not in root view */}
                {(isInSubpage || debouncedSearchText) && (
                  <div className="px-2.5 py-1.5 mx-1 text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                    <span>
                      {(showingFilesList || hasOnlyFiles) ? "Files & Folders" :
                       showingSkillsList ? "Skills" :
                       showingAgentsList ? "Agents" :
                       showingToolsList ? "MCP Servers" :
                       "Results"}
                    </span>
                    {isFetching && !isLoading && (
                      <IconSpinner className="h-2.5 w-2.5" />
                    )}
                  </div>
                )}
                {options.map((option, index) => {
                  const isSelected = selectedIndex === index
                  const OptionIcon = getOptionIcon(option)
                  const isCategory = option.type === "category"
                  const showTooltip = !isCategory && option.type !== "tool" && option.path

                  const itemContent = (
                    <div
                      data-option-index={index}
                      onClick={() => onSelect(option)}
                      onMouseEnter={() => {
                        setHoverIndex(index)
                        setSelectedIndex(index)
                      }}
                      onMouseLeave={() => {
                        setHoverIndex((prev) => (prev === index ? null : prev))
                      }}
                      className={cn(
                        "group inline-flex w-[calc(100%-8px)] mx-1 items-center whitespace-nowrap outline-none",
                        "h-7 px-1.5 justify-start text-xs rounded-md",
                        "transition-colors cursor-pointer select-none gap-1.5",
                        isSelected
                          ? "dark:bg-neutral-800 bg-accent text-foreground"
                          : "text-muted-foreground dark:hover:bg-neutral-800 hover:bg-accent hover:text-foreground",
                      )}
                    >
                      <OptionIcon className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                      <span className="flex items-center gap-1 w-full min-w-0">
                        <span className={cn("shrink-0 whitespace-nowrap", isCategory && "font-medium")}>
                          {option.label}
                        </span>
                        {/* Diff stats for changed files */}
                        {(option.additions || option.deletions) && (
                          <span className="shrink-0 flex items-center gap-1 text-[10px] font-mono">
                            {option.additions ? (
                              <span className="text-green-500">
                                +{option.additions}
                              </span>
                            ) : null}
                            {option.deletions ? (
                              <span className="text-red-500">
                                -{option.deletions}
                              </span>
                            ) : null}
                          </span>
                        )}
                        {/* Show truncated path for files only, not for skills/agents (they show in tooltip) */}
                        {option.truncatedPath && !isCategory && option.type !== "skill" && option.type !== "agent" && (
                          <span
                            className="text-muted-foreground flex-1 min-w-0 ml-2 font-mono overflow-hidden text-[10px]"
                            style={{
                              direction: "rtl",
                              textAlign: "left",
                              whiteSpace: "nowrap",
                            }}
                          >
                            <span style={{ direction: "ltr" }}>
                              {option.truncatedPath}
                            </span>
                          </span>
                        )}
                      </span>
                      {/* ChevronRight for category items (navigate to subpage) */}
                      {isCategory && (
                        <ChevronRight className="ml-auto h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                      )}
                    </div>
                  )

                  if (showTooltip) {
                    return (
                      <Tooltip key={option.id} open={isSelected}>
                        <TooltipTrigger asChild>
                          {itemContent}
                        </TooltipTrigger>
                        <TooltipContent
                          side="left"
                          align="start"
                          sideOffset={8}
                          collisionPadding={16}
                          avoidCollisions
                          className="overflow-hidden"
                        >
                          {renderTooltipContent(option)}
                        </TooltipContent>
                      </Tooltip>
                    )
                  }

                  return <div key={option.id}>{itemContent}</div>
                })}
              </>
          </>
        )}
      </div>
    </TooltipProvider>,
    document.body
  )
})

