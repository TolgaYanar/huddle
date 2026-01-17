import { defineConfig } from "vite";
import fs from "node:fs";
import path from "node:path";

function copyPublicToDist() {
  return {
    name: "copy-public-to-dist",
    closeBundle() {
      const publicDir = path.resolve(__dirname, "public");
      const distDir = path.resolve(__dirname, "dist");
      if (!fs.existsSync(distDir)) fs.mkdirSync(distDir, { recursive: true });
      for (const file of fs.readdirSync(publicDir)) {
        const src = path.join(publicDir, file);
        const dst = path.join(distDir, file);
        fs.copyFileSync(src, dst);
      }
    },
  };
}

export default defineConfig({
  build: {
    outDir: "dist",
    emptyOutDir: true,
    rollupOptions: {
      input: {
        popup: path.resolve(__dirname, "src/popup.ts"),
        content: path.resolve(__dirname, "src/content.ts"),
        background: path.resolve(__dirname, "src/background.ts"),
      },
      output: {
        entryFileNames: (chunk) => {
          if (chunk.name === "popup") return "popup.js";
          if (chunk.name === "content") return "content.js";
          if (chunk.name === "background") return "background.js";
          return "[name].js";
        },
        chunkFileNames: "chunks/[name]-[hash].js",
        assetFileNames: "assets/[name]-[hash][extname]",
      },
    },
    target: "es2022",
    sourcemap: true,
    minify: false,
  },
  plugins: [copyPublicToDist()],
});
