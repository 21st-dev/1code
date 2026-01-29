import { loader } from "@monaco-editor/react"
import * as monaco from "monaco-editor"
import type { editor } from "monaco-editor"
import editorWorker from "monaco-editor/esm/vs/editor/editor.worker?worker"
import jsonWorker from "monaco-editor/esm/vs/language/json/json.worker?worker"
import cssWorker from "monaco-editor/esm/vs/language/css/css.worker?worker"
import htmlWorker from "monaco-editor/esm/vs/language/html/html.worker?worker"
import tsWorker from "monaco-editor/esm/vs/language/typescript/ts.worker?worker"

// Configure Monaco workers for Vite
// @ts-ignore - Monaco's global window setup
self.MonacoEnvironment = {
  getWorker(_: unknown, label: string) {
    if (label === "json") {
      return new jsonWorker()
    }
    if (label === "css" || label === "scss" || label === "less") {
      return new cssWorker()
    }
    if (label === "html" || label === "handlebars" || label === "razor") {
      return new htmlWorker()
    }
    if (label === "typescript" || label === "javascript") {
      return new tsWorker()
    }
    return new editorWorker()
  },
}

// Configure Monaco to use local package instead of CDN
// This is required for Electron apps due to CSP restrictions
loader.config({ monaco })

// Default editor options for read-only file viewing
export const defaultEditorOptions: editor.IStandaloneEditorConstructionOptions = {
  readOnly: true,
  minimap: { enabled: false },
  lineNumbers: "on",
  wordWrap: "off",
  automaticLayout: true,
  fontSize: 13,
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
  folding: true,
  foldingStrategy: "indentation",
  showFoldingControls: "mouseover",
  bracketPairColorization: { enabled: true },
  guides: {
    bracketPairs: true,
    indentation: true,
  },
  scrollBeyondLastLine: false,
  renderWhitespace: "selection",
  scrollbar: {
    vertical: "auto",
    horizontal: "auto",
    useShadows: false,
    verticalScrollbarSize: 10,
    horizontalScrollbarSize: 10,
  },
  padding: {
    top: 8,
    bottom: 8,
  },
  // Disable features not needed for read-only viewing
  quickSuggestions: false,
  parameterHints: { enabled: false },
  suggestOnTriggerCharacters: false,
  acceptSuggestionOnEnter: "off",
  tabCompletion: "off",
  wordBasedSuggestions: "off",
  // Enable search functionality
  find: {
    addExtraSpaceOnTop: false,
    autoFindInSelection: "never",
    seedSearchStringFromSelection: "always",
  },
  // Make it look nice
  smoothScrolling: true,
  cursorBlinking: "solid",
  cursorStyle: "line",
  renderLineHighlight: "line",
  contextmenu: true,
  mouseWheelZoom: true,
}

// Map app theme to Monaco theme
export function getMonacoTheme(appTheme: string): string {
  // Check if it's a dark theme
  const isDark = appTheme.includes("dark") ||
                 appTheme === "vesper" ||
                 appTheme === "min-dark" ||
                 appTheme === "vitesse-dark"

  return isDark ? "vs-dark" : "vs"
}
