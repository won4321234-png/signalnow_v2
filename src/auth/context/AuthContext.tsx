import React, { createContext, useCallback, useEffect, useState } from "react";

import { AuthService } from "@/auth/services/authService";
import type { AuthContextValue, AuthStatus, User } from "@/auth/types/auth";

/**
 * AuthContext — exposes the current auth state and action methods to the tree.
 *
 * Starts as null so consumers can detect when they are rendered outside
 * the AuthProvider and throw a helpful error.
 */
export const AuthContext = createContext<AuthContextValue | null>(null);

interface AuthProviderProps {
  children: React.ReactNode;
}

/**
 * AuthProvider
 *
 * Wraps the application and manages authentication state.
 * On mount it attempts to restore an existing session so the user
 * stays logged in across page reloads.
 *
 * TODO: On mount, call AuthService.getCurrentUser() to restore any
 *       persisted session. Update `status` and `user` accordingly.
 *
 * TODO: Set up a token refresh interval here (e.g. every 50 minutes)
 *       to keep long-lived sessions alive without forcing re-login.
 *
 * TODO: Listen to the Google One Tap credential response callback
 *       if using the auto sign-in flow.
 */
export function AuthProvider({ children }: AuthProviderProps) {
  const [status, setStatus] = useState<AuthStatus>("unauthenticated");
  const [user, setUser] = useState<User | null>(null);

  // On mount: attempt to restore an existing session.
  useEffect(() => {
    let cancelled = false;

    async function restoreSession() {
      setStatus("loading");
      try {
        // TODO: Replace this with AuthService.getCurrentUser() once the
        //       backend is connected. For now it always returns null.
        const existingUser = await AuthService.getCurrentUser();
        if (!cancelled) {
          if (existingUser) {
            setUser(existingUser);
            setStatus("authenticated");
          } else {
            setStatus("unauthenticated");
          }
        }
      } catch {
        if (!cancelled) {
          setStatus("unauthenticated");
        }
      }
    }

    restoreSession();
    return () => {
      cancelled = true;
    };
  }, []);

  /**
   * Initiates the Google OAuth login flow.
   *
   * TODO: Await AuthService.loginWithGoogle(), receive the User object,
   *       call setUser(user) and setStatus("authenticated").
   *
   * TODO: Persist the session token returned alongside the User.
   */
  const loginWithGoogle = useCallback(async () => {
    // TODO: Connect Google OAuth here.
    // const loggedInUser = await AuthService.loginWithGoogle();
    // setUser(loggedInUser);
    // setStatus("authenticated");
  }, []);

  /**
   * Clears the current session.
   *
   * TODO: Await AuthService.logout(), then reset state.
   */
  const logout = useCallback(async () => {
    // TODO: Handle logout.
    // await AuthService.logout();
    setUser(null);
    setStatus("unauthenticated");
  }, []);

  const value: AuthContextValue = {
    status,
    user,
    loginWithGoogle,
    logout,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
