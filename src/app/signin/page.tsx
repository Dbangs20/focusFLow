"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { getProviders, signIn, useSession } from "next-auth/react";
import type { ClientSafeProvider } from "next-auth/react";

type ProviderMap = Record<string, ClientSafeProvider>;

export default function SignInPage() {
  const searchParams = useSearchParams();
  const { data: session, status } = useSession();
  const [providers, setProviders] = useState<ProviderMap>({});
  const [providersFailed, setProvidersFailed] = useState(false);
  const [email, setEmail] = useState("");
  const callbackUrl = searchParams?.get("callbackUrl") || "/dashboard";

  useEffect(() => {
    const loadProviders = async () => {
      try {
        const res = await getProviders();
        setProviders(res ?? {});
      } catch {
        setProvidersFailed(true);
      }
    };

    loadProviders();
  }, []);

  const sortedProviders = useMemo(() => Object.values(providers), [providers]);
  const hasProviders = sortedProviders.length > 0;
  const oauthProviders = hasProviders
    ? sortedProviders.filter((provider) => provider.id !== "email")
    : [{ id: "github", name: "GitHub" } as ClientSafeProvider];
  const emailEnabled = hasProviders ? Boolean(providers.email) : true;

  if (status === "loading") {
    return <div className="max-w-xl mx-auto p-6 text-sm ff-subtle">Loading...</div>;
  }

  if (session?.user) {
    return (
      <div className="max-w-xl mx-auto p-6 space-y-3 ff-card">
        <h1 className="text-2xl font-bold">You are signed in</h1>
        <p className="text-sm ff-subtle">
          Signed in as {session.user.email || session.user.name || "user"}
        </p>
        <Link href={callbackUrl} className="text-sm underline" style={{ color: "var(--accent-primary)" }}>
          Continue
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-xl mx-auto p-6 space-y-4 ff-card">
      <h1 className="text-2xl font-bold">Sign In</h1>
      <p className="text-sm ff-subtle">Choose a provider to continue.</p>
      {providersFailed && (
        <p className="text-xs" style={{ color: "var(--accent-warning)" }}>
          Provider lookup failed. Showing fallback sign-in options.
        </p>
      )}

      <div className="space-y-2">
        {oauthProviders.map((provider) => (
            <button
              key={provider.id}
              onClick={() =>
                void signIn(
                  provider.id,
                  { callbackUrl },
                  provider.id === "github" ? { prompt: "select_account" } : undefined,
                )
              }
              className="w-full px-4 py-2 rounded text-sm text-left ff-btn ff-btn-ghost"
            >
              Continue with {provider.name}
            </button>
          ))}
      </div>

      {emailEnabled && (
        <div
          className="space-y-2 rounded p-3"
          style={{ border: "1px solid var(--card-border)", background: "var(--surface-2)" }}
        >
          <p className="text-sm ff-subtle">Sign in with email link</p>
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="email@domain.com"
            className="w-full px-3 py-2 rounded text-sm"
            style={{ background: "var(--surface-2)", border: "1px solid var(--card-border)" }}
          />
          <button
            onClick={() => {
              if (email.trim()) {
                void signIn("email", {
                  email: email.trim(),
                  callbackUrl,
                });
              }
            }}
            className="w-full px-4 py-2 rounded text-sm ff-btn ff-btn-primary"
          >
            Send Magic Link
          </button>
        </div>
      )}
    </div>
  );
}
