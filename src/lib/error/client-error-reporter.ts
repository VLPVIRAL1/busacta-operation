import { supabase } from "@/integrations/supabase/client";

type Payload = {
  name?: string;
  message: string;
  stack?: string;
  component_stack?: string;
  route?: string;
  extra?: Record<string, unknown>;
};

let installed = false;
const recent: string[] = [];

function dedupeKey(p: Payload) {
  return `${p.name ?? ""}|${p.message}|${(p.stack ?? "").slice(0, 120)}`;
}

export async function reportClientError(p: Payload) {
  if (typeof window === "undefined") return;
  const key = dedupeKey(p);
  if (recent.includes(key)) return;
  recent.push(key);
  if (recent.length > 50) recent.shift();
  try {
    const { data: u } = await supabase.auth.getUser();
    const role = typeof window !== "undefined" ? window.localStorage.getItem("active-role") : null;
    await supabase.from("client_error_log" as never).insert({
      user_id: u?.user?.id ?? null,
      role,
      route: p.route ?? window.location.pathname,
      name: p.name ?? null,
      message: p.message,
      stack: p.stack ?? null,
      component_stack: p.component_stack ?? null,
      ua: navigator.userAgent,
      extra: p.extra ?? null,
    } as never);
  } catch (err) {
    // Never let reporter throw — would create error loop
    console.warn("[error-reporter] failed", err);
  }
}

export function installGlobalErrorReporter() {
  if (installed || typeof window === "undefined") return;
  installed = true;
  window.addEventListener("error", (e) => {
    const err = e.error;
    void reportClientError({
      name: err?.name ?? "Error",
      message: err?.message ?? String(e.message ?? "Unknown error"),
      stack: err?.stack,
      route: window.location.pathname,
    });
  });
  window.addEventListener("unhandledrejection", (e) => {
    const r = e.reason as Error | undefined;
    void reportClientError({
      name: r?.name ?? "UnhandledRejection",
      message: r?.message ?? String(r ?? "Unhandled rejection"),
      stack: r?.stack,
      route: window.location.pathname,
    });
  });
}
