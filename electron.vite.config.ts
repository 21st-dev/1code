import { defineConfig, externalizeDepsPlugin } from "electron-vite"
import { loadEnv } from "vite"
import { resolve } from "path"
import react from "@vitejs/plugin-react"
import tailwindcss from "tailwindcss"
import autoprefixer from "autoprefixer"

// Load .env files before accessing process.env
// This ensures .env.local is loaded for dev mode
const env = loadEnv("", process.cwd(), "MAIN_VITE_")
Object.assign(process.env, env)

// Log Foundry env vars status at build time (for debugging CI builds)
console.log("\n[Build] Foundry credentials status:")
console.log(`  MAIN_VITE_CLAUDE_CODE_USE_FOUNDRY: ${process.env.MAIN_VITE_CLAUDE_CODE_USE_FOUNDRY ? "SET" : "NOT SET"}`)
console.log(`  MAIN_VITE_ANTHROPIC_FOUNDRY_RESOURCE: ${process.env.MAIN_VITE_ANTHROPIC_FOUNDRY_RESOURCE ? "SET" : "NOT SET"}`)
console.log(`  MAIN_VITE_ANTHROPIC_FOUNDRY_API_KEY: ${process.env.MAIN_VITE_ANTHROPIC_FOUNDRY_API_KEY ? "SET (hidden)" : "NOT SET"}`)
console.log(`  MAIN_VITE_ANTHROPIC_DEFAULT_OPUS_MODEL: ${process.env.MAIN_VITE_ANTHROPIC_DEFAULT_OPUS_MODEL || "NOT SET"}\n`)

export default defineConfig({
  main: {
    plugins: [
      externalizeDepsPlugin({
        // Don't externalize these - bundle them instead
        exclude: ["superjson", "trpc-electron", "gray-matter"],
      }),
    ],
    define: {
      // Inline Foundry credentials at build time (for CI builds with baked-in auth)
      "import.meta.env.MAIN_VITE_CLAUDE_CODE_USE_FOUNDRY": JSON.stringify(
        process.env.MAIN_VITE_CLAUDE_CODE_USE_FOUNDRY || ""
      ),
      "import.meta.env.MAIN_VITE_ANTHROPIC_FOUNDRY_RESOURCE": JSON.stringify(
        process.env.MAIN_VITE_ANTHROPIC_FOUNDRY_RESOURCE || ""
      ),
      "import.meta.env.MAIN_VITE_ANTHROPIC_FOUNDRY_API_KEY": JSON.stringify(
        process.env.MAIN_VITE_ANTHROPIC_FOUNDRY_API_KEY || ""
      ),
      "import.meta.env.MAIN_VITE_ANTHROPIC_DEFAULT_OPUS_MODEL": JSON.stringify(
        process.env.MAIN_VITE_ANTHROPIC_DEFAULT_OPUS_MODEL || ""
      ),
      // Web app URL for auth - defaults to production
      "import.meta.env.MAIN_VITE_WEB_APP_URL": JSON.stringify(
        process.env.MAIN_VITE_WEB_APP_URL || "https://anchor.kosal.io"
      ),
    },
    build: {
      lib: {
        entry: resolve(__dirname, "src/main/index.ts"),
      },
      rollupOptions: {
        external: [
          "electron",
          "better-sqlite3",
          "@prisma/client",
          "@anthropic-ai/claude-agent-sdk", // ESM module - must use dynamic import
        ],
        output: {
          format: "cjs",
        },
      },
    },
  },
  preload: {
    plugins: [
      externalizeDepsPlugin({
        exclude: ["trpc-electron"],
      }),
    ],
    build: {
      lib: {
        entry: resolve(__dirname, "src/preload/index.ts"),
      },
      rollupOptions: {
        external: ["electron"],
        output: {
          format: "cjs",
        },
      },
    },
  },
  renderer: {
    plugins: [react()],
    resolve: {
      alias: {
        "@": resolve(__dirname, "src/renderer"),
      },
    },
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, "src/renderer/index.html"),
          login: resolve(__dirname, "src/renderer/login.html"),
        },
      },
    },
    css: {
      postcss: {
        plugins: [tailwindcss, autoprefixer],
      },
    },
  },
})
