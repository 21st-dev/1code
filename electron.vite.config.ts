import { defineConfig, externalizeDepsPlugin } from "electron-vite"
import { resolve } from "path"
import react from "@vitejs/plugin-react"
import tailwindcss from "tailwindcss"
import autoprefixer from "autoprefixer"
import type { Plugin } from "vite"

const isDev = process.env.NODE_ENV !== "production"

function pierreDiffsPlainHighlighterPlugin(): Plugin {
  const shimPath = resolve(
    __dirname,
    "src/renderer/lib/vendor/pierre-diffs-shiki-shim.ts",
  )

  return {
    name: "locus:pierre-diffs-plain-highlighter",
    enforce: "pre",
    resolveId(source, importer) {
      const normalizedImporter = importer?.replace(/\\/g, "/")
      if (!normalizedImporter?.includes("/node_modules/@pierre/diffs/")) {
        return null
      }

      if (
        source === "shiki" ||
        source === "shiki/core" ||
        source === "@shikijs/engine-javascript" ||
        source === "@shikijs/transformers"
      ) {
        return shimPath
      }

      return null
    },
  }
}

export default defineConfig({
  main: {
    plugins: [
      externalizeDepsPlugin({
        // Don't externalize these - bundle them instead
        exclude: ["superjson", "trpc-electron", "gray-matter", "async-mutex"],
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
    plugins: [
      pierreDiffsPlainHighlighterPlugin(),
      react({
        // In dev mode, use WDYR as JSX import source to track ALL component re-renders
        jsxImportSource: isDev
          ? "@welldone-software/why-did-you-render"
          : undefined,
      }),
    ],
    resolve: {
      alias: {
        "@": resolve(__dirname, "src/renderer"),
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
