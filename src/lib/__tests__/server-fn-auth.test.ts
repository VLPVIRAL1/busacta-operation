import { describe, it, expect, vi } from "vitest";
import { createAuthenticatedServerFnFetch } from "@/lib/auth/server-fn-auth";

function makeOriginalFetch(response: Response = new Response("ok", { status: 200 })) {
  return vi.fn(
    async (_input: RequestInfo | URL, _init?: RequestInit) => response,
  ) as unknown as typeof fetch;
}

describe("createAuthenticatedServerFnFetch", () => {
  it("attaches Bearer token on /_serverFn/* requests", async () => {
    const original = makeOriginalFetch();
    const recordFailure = vi.fn();
    const wrapped = createAuthenticatedServerFnFetch({
      originalFetch: original,
      getAccessToken: async () => "test-token-abc",
      recordFailure,
    });
    await wrapped("https://app.example.com/_serverFn/foo", { method: "GET" });
    const call = (original as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    const init = call[1] as RequestInit;
    const headers = new Headers(init.headers);
    expect(headers.get("authorization")).toBe("Bearer test-token-abc");
    expect(recordFailure).not.toHaveBeenCalled();
  });

  it("does not modify non-serverFn requests", async () => {
    const original = makeOriginalFetch();
    const wrapped = createAuthenticatedServerFnFetch({
      originalFetch: original,
      getAccessToken: async () => "tok",
    });
    await wrapped("https://app.example.com/api/whatever");
    expect((original as unknown as ReturnType<typeof vi.fn>).mock.calls[0][1]).toBeUndefined();
  });

  it("preserves an existing Authorization header on /_serverFn/*", async () => {
    const original = makeOriginalFetch();
    const wrapped = createAuthenticatedServerFnFetch({
      originalFetch: original,
      getAccessToken: async () => "new-token",
    });
    await wrapped("https://app.example.com/_serverFn/x", {
      headers: { authorization: "Bearer existing" },
    });
    const init = (original as unknown as ReturnType<typeof vi.fn>).mock.calls[0][1] as RequestInit;
    expect(new Headers(init.headers).get("authorization")).toBe("Bearer existing");
  });

  it("records a failure entry when /_serverFn/* returns non-OK", async () => {
    const original = makeOriginalFetch(
      new Response("nope", { status: 401, statusText: "Unauthorized" }),
    );
    const recordFailure = vi.fn();
    const wrapped = createAuthenticatedServerFnFetch({
      originalFetch: original,
      getAccessToken: async () => "tok",
      recordFailure,
    });
    await wrapped("https://app.example.com/_serverFn/foo");
    expect(recordFailure).toHaveBeenCalledTimes(1);
    const entry = recordFailure.mock.calls[0][0];
    expect(entry.bearerAttached).toBe(true);
    expect(entry.status).toBe(401);
    expect(entry.tokenAvailable).toBe(true);
  });

  it("records that no bearer was attached when token is missing", async () => {
    const original = makeOriginalFetch(new Response("nope", { status: 401 }));
    const recordFailure = vi.fn();
    const wrapped = createAuthenticatedServerFnFetch({
      originalFetch: original,
      getAccessToken: async () => null,
      recordFailure,
    });
    await wrapped("https://app.example.com/_serverFn/foo");
    expect(recordFailure).toHaveBeenCalledTimes(1);
    expect(recordFailure.mock.calls[0][0].bearerAttached).toBe(false);
    expect(recordFailure.mock.calls[0][0].tokenAvailable).toBe(false);
  });
});
