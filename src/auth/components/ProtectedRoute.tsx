import type { ReactNode } from "react";

/**
 * ProtectedRoute — gatekeeper for routes that require authentication.
 *
 * Current behavior: simply renders children.
 *
 * TODO: Check the user's authentication status via useAuth().
 * TODO: If status === "unauthenticated", redirect to the login modal.
 * TODO: If status === "loading", render a loading spinner / skeleton.
 * TODO: If status === "expired", show the ExpiredSession component.
 * TODO: If status === "authenticated", render children.
 *
 * Usage:
 *   <ProtectedRoute>
 *     <MyPage />
 *   </ProtectedRoute>
 */
export function ProtectedRoute({ children }: { children: ReactNode }) {
  // TODO: Replace with real auth verification:
  //
  //   const { status } = useAuth();
  //
  //   if (status === "loading") {
  //     return <AuthLoading />;
  //   }
  //   if (status === "unauthenticated") {
  //     return <AuthUnauthenticated onLogin={...} />;
  //   }
  //   if (status === "expired") {
  //     return <AuthExpiredSession onReLogin={...} />;
  //   }
  //
  //   return <>{children}</>;

  return <>{children}</>;
}
