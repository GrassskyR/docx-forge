import { defineConfig } from "vite"
import vue from "@vitejs/plugin-vue"
import tailwindcss from "@tailwindcss/vite"

const port = process.env.PORT || process.env.ENGINE_PORT || "8000"
const target = "http://127.0.0.1:" + port

export default defineConfig({
  plugins: [vue(), tailwindcss()],
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
  server: {
    proxy: {
      "/api": target,
      "/files": target,
      "/health": target,
    },
  },
})
