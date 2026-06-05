"use client";

import { useEffect, useRef, useState } from "react";

export function PremiumSearchRunner({ reportId, accessToken }: { reportId: string; accessToken?: string }) {
  const started = useRef(false);
  const [message, setMessage] = useState("Running your live search... this can take 30-60 seconds.");
  const [error, setError] = useState("");

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    async function run() {
      const response = await fetch("/api/premium-search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reportId, token: accessToken })
      });
      const result = (await response.json().catch(() => null)) as { status?: string; offerCount?: number; error?: string } | null;

      if (!response.ok) {
        setError(result?.error ?? "The premium search could not run. Please contact support.");
        return;
      }

      if (result?.status === "completed") {
        setMessage("Premium search completed. Loading your leads...");
        window.location.reload();
        return;
      }

      if (result?.status === "running") {
        setMessage("Your premium search is already running. Refresh this page in a moment to check the result.");
        return;
      }

      setMessage("Premium search status updated. Refresh this page in a moment to check the result.");
    }

    run().catch(() => setError("The premium search could not start. Please contact support."));
  }, [accessToken, reportId]);

  return (
    <div className="mt-8 max-w-2xl rounded-lg border border-emerald-100 bg-white p-8 shadow-soft">
      <p className="text-sm font-semibold uppercase text-signal">Live search</p>
      <h1 className="mt-3 text-4xl font-bold text-ink">Finding your premium leads</h1>
      <p className="mt-4 text-ink/70">{message}</p>
      {error ? <p className="mt-4 rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}
      <button type="button" onClick={() => window.location.reload()} className="mt-6 inline-flex button-secondary">
        Refresh status
      </button>
    </div>
  );
}
