import { defineConfig, externalizeDepsPlugin } from "electron-vite"
import { resolve } from "path"
import react from "@vitejs/plugin-react"
import tailwindcss from "tailwindcss"
import autoprefixer from "autoprefixer"

export default defineConfig({
  main: {
    plugins: [
      externalizeDepsPlugin({
        // Don't externalize these - bundle them instead
        exclude: ["superjson", "trpc-electron", "gray-matter"],
      }),
    ],
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
        // Stub Node.js core modules used by commit-graph
        tty: resolve(__dirname, "src/renderer/lib/stubs/tty.ts"),
      },
    },
    define: {
      // Fix for Node.js modules that expect process to be defined (commit-graph uses these)
      "process.env.NODE_ENV": JSON.stringify("development"),
      "process.env.NO_COLOR": JSON.stringify(""),
      "process.env.FORCE_COLOR": JSON.stringify(""),
      "process.env.TERM": JSON.stringify("xterm-256color"),
      "process.env.CI": JSON.stringify(""),
      "process.platform": JSON.stringify("darwin"),
      "process.argv": JSON.stringify([]),
    },
    optimizeDeps: {
      esbuildOptions: {
        define: {
          global: "globalThis",
        },
      },
    },
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, "src/renderer/index.html"),
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
