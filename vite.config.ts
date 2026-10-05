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
        rewrite: (path) => {\n          const key = process.env.TRAFFIC_API_SERVICE_KEY || process.env.TRAFFIC_API_KEY || process.env.VITE_TRAFFIC_API_KEY || process.env.VITE_DATA_API_SERVICE_KEY || "";\n          const url = new URL(path, "http://localhost");\n          url.pathname = url.pathname.replace(/^\\/api\\/traffic/, "");\n          if (key) url.searchParams.set("serviceKey", key);\n          return url.pathname + url.search;\n        },
      },
    },
  },
})
