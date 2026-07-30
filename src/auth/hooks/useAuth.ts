import { useContext } from "react";

import { AuthContext } from "@/auth/context/AuthContext";
import type { AuthContextValue } from "@/auth/types/auth";

/**
 * useAuth — returns the current authentication context.
 *
 * Throws if called outside of <AuthProvider> to catch integration
 * mistakes early during development.
 *
 * Usage:
 *   const { status, user, loginWithGoogle, logout } = useAuth();
 */
export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used inside <AuthProvider>.");
  }
  return ctx;
}
