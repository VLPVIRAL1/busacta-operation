import { toast } from "sonner";
import { useNavigate } from "@tanstack/react-router";

/**
 * Show a "session expired — please sign in again" toast with an action button
 * that takes the user to /login (preserving the current path as ?redirect=).
 * Use after timer (or any other) mutation errors flagged by isAuthExpiredError.
 */
export function useSessionExpiredToast() {
  const navigate = useNavigate();
  return () => {
    const here =
      typeof window !== "undefined" ? window.location.pathname + window.location.search : "/";
    toast.error("Your session expired. Please sign in again to stop the timer.", {
      duration: 10000,
      action: {
        label: "Sign in",
        onClick: () => navigate({ to: "/login", search: { redirect: here } as never }),
      },
    });
  };
}
