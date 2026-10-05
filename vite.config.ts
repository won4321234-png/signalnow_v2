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
        rewrite: (path) => {
          const key = process.env.TRAFFIC_API_SERVICE_KEY || process.env.TRAFFIC_API_KEY || process.env.VITE_TRAFFIC_API_KEY || process.env.VITE_DATA_API_SERVICE_KEY || "";
          const url = new URL(path, "http://localhost");
          url.pathname = url.pathname.replace(/^\/api\/traffic/, "");
          if (key) url.searchParams.set("serviceKey", key);
          return url.pathname + url.search;
        },
      },
    },
  },
})
