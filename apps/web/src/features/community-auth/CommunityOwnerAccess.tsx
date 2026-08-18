"use client";

import { FormEvent, useEffect, useState } from "react";

type State = "checking" | "signed-out" | "signed-in" | "submitting" | "failed";

export function CommunityOwnerAccess() {
  const [state, setState] = useState<State>("checking");

  useEffect(() => {
    void fetch("/api/community-auth/session/status", {
      credentials: "same-origin",
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("status_failed");
        return (await response.json()) as { authenticated: boolean };
      })
      .then((result) =>
        setState(result.authenticated ? "signed-in" : "signed-out"),
      )
      .catch(() => setState("signed-out"));
  }, []);

  async function signIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    const accessSecret = formData.get("accessSecret");
    if (typeof accessSecret !== "string" || accessSecret === "") return;
    setState("submitting");
    try {
      const response = await fetch("/api/community-auth/session", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accessSecret }),
      });
      setState(response.ok ? "signed-in" : "failed");
    } catch {
      setState("failed");
    } finally {
      // The credential is never retained in browser storage or application state.
      form.reset();
    }
  }

  async function signOut() {
    await fetch("/api/community-auth/session", {
      method: "DELETE",
      credentials: "same-origin",
    });
    setState("signed-out");
  }

  if (state === "checking") return <p role="status">Checking owner access…</p>;
  if (state === "signed-in") {
    return (
      <div className="local-banner" role="status">
        Owner access is active.{" "}
        <button type="button" onClick={signOut}>
          Sign out
        </button>
      </div>
    );
  }
  return (
    <form onSubmit={signIn} className="owner-access-form">
      <label htmlFor="community-access-secret">Owner access secret</label>
      <input
        autoComplete="current-password"
        id="community-access-secret"
        name="accessSecret"
        required
        type="password"
      />
      <button type="submit" disabled={state === "submitting"}>
        {state === "submitting" ? "Signing in…" : "Sign in"}
      </button>
      {state === "failed" ? (
        <p role="alert">Owner access could not be verified.</p>
      ) : null}
    </form>
  );
}
