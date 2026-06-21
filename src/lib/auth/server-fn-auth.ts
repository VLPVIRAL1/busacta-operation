// Client-only fetch interceptor that injects the current Supabase access token
// as a Bearer Authorization header on every request to TanStack server functions
// (path prefix `/_serverFn/`). Server fns guarded by `requireSupabaseAuth` need
// this header — without it they throw a 401 Response that surfaces as a
// "[object Response]" runtime error in the client.
import { supabase } from "@/integrations/supabase/client";
import { recordServerFnAuthDebug } from "@/lib/auth/server-fn-auth-debug";

let installed = false;

export function createAuthenticatedServerFnFetch({
  originalFetch,
  getAccessToken,
  recordFailure = recordServerFnAuthDebug,
}: {
  originalFetch: typeof fetch;
  getAccessToken: () => Promise<string | null | undefined>;
  recordFailure?: typeof recordServerFnAuthDebug;
}): typeof fetch {
  return async (input, init) => {
    let isServerFn = false;
    let url = "";
    const method = init?.method ?? (input instanceof Request ? input.method : "GET");
    let hadExistingAuthorization = false;
    let tokenAvailable = false;
    let tokenPrefix: string | null = null;
    let bearerAttached = false;
    try {
      url =
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.toString()
            : input instanceof Request
              ? input.url
              : "";
      isServerFn = url.includes("/_serverFn/");
      if (!isServerFn) return originalFetch(input, init);

      const token = await getAccessToken();
      tokenAvailable = !!token;
      const headers = new Headers(
        init?.headers ?? (input instanceof Request ? input.headers : undefined),
      );
      hadExistingAuthorization = headers.has("authorization");
      if (!headers.has("authorization") && token) headers.set("authorization", `Bearer ${token}`);
      const authorization = headers.get("authorization");
      bearerAttached = !!authorization?.startsWith("Bearer ");
      tokenPrefix = authorization?.startsWith("Bearer ") ? authorization.slice(7, 17) : null;

      const response =
        input instanceof Request
          ? await originalFetch(new Request(input, { ...init, headers }))
          : await originalFetch(input, { ...init, headers });
      if (!response.ok)
        recordFailure({
          url,
          method,
          status: response.status,
          ok: false,
          bearerAttached,
          hadExistingAuthorization,
          tokenAvailable,
          tokenPrefix,
          errorMessage: response.statusText || null,
        });
      return response;
    } catch (error) {
      if (isServerFn)
        recordFailure({
          url,
          method,
          status: "network-error",
          ok: false,
          bearerAttached,
          hadExistingAuthorization,
          tokenAvailable,
          tokenPrefix,
          errorMessage: error instanceof Error ? error.message : "Unknown fetch error",
        });
      return originalFetch(input, init);
    }
  };
}

export function installServerFnAuth() {
  if (installed || typeof window === "undefined") return;
  installed = true;

  const originalFetch = window.fetch.bind(window);
  window.fetch = createAuthenticatedServerFnFetch({
    originalFetch,
    getAccessToken: async () => (await supabase.auth.getSession()).data.session?.access_token,
  });
}
