import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

// Admin View without the PIN unlocked: the database already refuses every
// write (RLS requires is_admin_edit_elevated()), but an UPDATE/DELETE whose
// row RLS excludes reports *success* with zero rows touched — so most pages
// look like they saved when nothing was written. While this flag is on, every
// browser-client write fails immediately with a clear error instead, which
// existing `if (error)` handling then surfaces. Set by AppShell, which is the
// only place that knows both isAdminView and isEditElevated.
let viewOnly = false;

export function setViewOnlyMode(value: boolean) {
  viewOnly = value;
}

const WRITE_METHODS = new Set(["insert", "update", "delete", "upsert"]);

export const VIEW_ONLY_MESSAGE =
  'Admin View is read-only — enter your PIN and click "Unlock editing" at the top, then try again.';

// A chainable stand-in for a write query (.eq().select().single() etc. all keep
// working) that resolves to the same { data, error } shape a real one would.
function blockedQuery() {
  const result = {
    data: null,
    error: { message: VIEW_ONLY_MESSAGE, details: "", hint: "", code: "VIEW_ONLY", name: "PostgrestError" },
    count: null,
    status: 403,
    statusText: "Forbidden",
  };
  const proxy: unknown = new Proxy(function () {}, {
    get(_target, prop) {
      if (prop === "then") {
        return (resolve: (v: typeof result) => unknown, reject: (e: unknown) => unknown) =>
          Promise.resolve(result).then(resolve, reject);
      }
      return () => proxy;
    },
  });
  return proxy;
}

// createBrowserClient hands back one shared instance per page load, so guard
// each instance only once rather than stacking wrappers on every createClient().
const guarded = new WeakSet<object>();

function guard(client: SupabaseClient): SupabaseClient {
  if (guarded.has(client)) return client;
  guarded.add(client);

  const originalFrom = client.from.bind(client);
  client.from = ((table: string) => {
    const builder = originalFrom(table);
    if (!viewOnly) return builder;
    return new Proxy(builder, {
      get(target, prop, receiver) {
        if (typeof prop === "string" && WRITE_METHODS.has(prop)) return () => blockedQuery();
        const value = Reflect.get(target, prop, receiver);
        return typeof value === "function" ? value.bind(target) : value;
      },
    });
  }) as typeof client.from;

  return client;
}

export function createClient() {
  return guard(
    createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    ) as SupabaseClient
  );
}
