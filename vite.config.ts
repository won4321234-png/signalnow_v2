import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": "/src",
    },
  },
  server: {
    host: "0.0.0.0",
    port: 5000,
    allowedHosts: true,
    proxy: {
      "/api/traffic": {
        target: "https://apis.data.go.kr/B551982/rti",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/traffic/, ""),
      },
    },
  },
})
