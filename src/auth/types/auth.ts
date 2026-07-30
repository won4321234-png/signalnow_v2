/**
 * SignalNow Authentication Types
 *
 * Designed for Google OAuth integration via Google Cloud Console.
 * These types map directly to the fields returned by Google's UserInfo
 * endpoint and will be populated once OAuth is connected.
 *
 * TODO: When connecting Google OAuth, populate these fields from
 *       the Google ID token or UserInfo API response.
 */

/** The authenticated user profile. */
export interface User {
  /** Google sub claim — unique stable user ID. */
  id: string;
  /** User's Google email address. */
  email: string;
  /** User's display name from Google profile. */
  name: string;
  /** URL of the user's Google profile picture. */
  profileImage: string | null;
  /** ISO timestamp of when the SignalNow account was first created. */
  createdAt: string;
  /** Number of intersections the user has marked as favorites. */
  favoriteCount: number;
  /** Number of recent intersection searches saved to the profile. */
  recentSearchCount: number;
}

/** The four possible authentication states of the application. */
export type AuthStatus =
  /** No session — user has not authenticated. */
  | "unauthenticated"
  /** Checking for an existing session on startup. */
  | "loading"
  /** User is authenticated and the session is valid. */
  | "authenticated"
  /** A session token existed but has expired; re-authentication needed. */
  | "expired";

/** Shape of the AuthContext value exposed to the application. */
export interface AuthContextValue {
  /** Current authentication state. */
  status: AuthStatus;
  /** The authenticated user, or null when not authenticated. */
  user: User | null;
  /** Initiates the Google OAuth login flow. */
  loginWithGoogle: () => Promise<void>;
  /** Clears the session and logs the user out. */
  logout: () => Promise<void>;
}
