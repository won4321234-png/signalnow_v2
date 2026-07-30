/**
 * Loads the Kakao Maps JavaScript SDK exactly once, regardless of how many
 * components call this hook. Uses a module-level singleton so that HMR and
 * multiple consumers share the same load state.
 *
 * The SDK URL uses `autoload=false` so we can call `kakao.maps.load()` in the
 * onload handler and be sure the API is fully initialised before notifying.
 */

import { useState, useEffect } from "react";

// ─── Singleton state ──────────────────────────────────────────────────────────

type SDKState = "idle" | "loading" | "loaded" | "error";

let _state: SDKState = "idle";
const _listeners = new Set<(s: SDKState) => void>();

function notify(next: SDKState) {
  _state = next;
  for (const cb of _listeners) cb(next);
}

function injectScript(appKey: string): void {
  // Prevent double injection
  if (_state === "loading" || _state === "loaded") return;

  // Guard: SDK already present in DOM (e.g. after HMR)
  if (typeof window !== "undefined" && window.kakao?.maps) {
    notify("loaded");
    return;
  }

  // Prevent injecting a second <script> tag
  if (document.getElementById("kakao-maps-sdk")) return;

  notify("loading");

  const script = document.createElement("script");
  script.id = "kakao-maps-sdk";
  script.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${encodeURIComponent(appKey)}&autoload=false`;
  script.async = true;

  script.onload = () => {
    console.log("[KakaoLoader] Script loaded, calling kakao.maps.load()…");
    window.kakao.maps.load(() => {
      console.log("[KakaoLoader] kakao.maps.load() ready ✓");
      notify("loaded");
    });
  };
  script.onerror = (e) => {
    console.error("[KakaoLoader] Script failed to load:", e);
    notify("error");
  };

  document.head.appendChild(script);
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export interface KakaoLoaderResult {
  /** True once `kakao.maps.load()` callback has fired and the API is ready. */
  loaded: boolean;
  /** True if the script tag failed to load or no API key was found. */
  error: boolean;
}

export function useKakaoLoader(): KakaoLoaderResult {
  const [state, setState] = useState<SDKState>(_state);

  useEffect(() => {
    // Already settled — sync once and skip registering a listener
    if (_state === "loaded") { setState("loaded"); return; }
    if (_state === "error")  { setState("error");  return; }

    const listener = (s: SDKState) => setState(s);
    _listeners.add(listener);

    const appKey = import.meta.env.VITE_KAKAO_MAP_KEY as string | undefined;
    if (!appKey) {
      console.error("[KakaoLoader] VITE_KAKAO_MAP_KEY is not set.");
      notify("error");
    } else {
      injectScript(appKey);
    }

    return () => { _listeners.delete(listener); };
  }, []);

  return { loaded: state === "loaded", error: state === "error" };
}
