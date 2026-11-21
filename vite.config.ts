import { cloudflare } from "@cloudflare/vite-plugin"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { URL, fileURLToPath } from "node:url"
import { defineConfig } from "vite"

export default defineConfig({
  plugins: [react(), tailwindcss(), cloudflare()],
  server: { watch: { ignored: ["**/.worktrees/**", "**/factory/jobs/**"] } },
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
})
