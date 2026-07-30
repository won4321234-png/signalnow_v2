# signalnow_v2

실시간 교통 신호 정보를 제공하는 React 웹 앱입니다. (Real-time traffic signal information web app)

## Stack

- **Frontend:** React 19 + TypeScript + Vite 7
- **Styling:** Tailwind CSS v4 (via `@tailwindcss/vite`) + shadcn/ui (new-york style)
- **UI components:** Radix UI, Lucide React, Recharts, Sonner, Vaul, cmdk
- **Auth:** Custom auth context with mock service (`src/auth/`)
- **Data:** Mock intersection/traffic data (`src/data/mockData.ts`) + `src/services/intersectionService.ts`

## How to run

```bash
npm install
npm run dev        # starts dev server on port 5000
npm run build      # production build (outputs to dist/)
npm run typecheck  # TypeScript check only
```

The Replit workflow **"Start application"** runs `npm run dev` and serves on port 5000.

## Project structure

```
src/
  App.tsx                  # Root component, page routing (map / mypage / settings)
  main.tsx                 # Entry point
  index.css                # Global styles + Tailwind v4 config
  auth/                    # Auth context, hooks, pages, services, types
  components/              # App-level components (Header, BottomSheet, MapPlaceholder, …)
  components/ui/           # shadcn/ui primitives
  data/                    # Mock traffic/intersection data
  hooks/                   # Custom React hooks
  lib/                     # Utility functions (utils.ts, signal.ts)
  services/                # Data fetching services
  types/                   # Shared TypeScript types
```

## Replit-specific config

`vite.config.ts` sets:
- `server.host: "0.0.0.0"` — binds to all interfaces
- `server.port: 5000` — Replit webview port
- `server.allowedHosts: true` — allows Replit's proxied iframe domain

## User preferences

- Preserve existing UI and functionality; do not redesign or rewrite without explicit instruction.
- Report every issue found and explain every fix made.
- Keep Korean UI text as-is.
