"use client";

import { useEffect, useRef, useState } from "react";

export function PremiumSearchRunner({
  reportId,
  accessToken,
  retry = false,
  autoStart = true
}: {
  reportId: string;
  accessToken?: string;
  retry?: boolean;
  autoStart?: boolean;
}) {
  const started = useRef(false);
  const [message, setMessage] = useState(retry ? "Ready to retry with broader criteria." : "Running your live search... this can take 30-60 seconds.");
  const [error, setError] = useState("");
  const [isRunning, setIsRunning] = useState(false);

  async function runSearch() {
    if (started.current) return;
    started.current = true;
    setIsRunning(true);
    setError("");
    setMessage(retry ? "Retrying with broader criteria... this can take 30-60 seconds." : "Running your live search... this can take 30-60 seconds.");

    try {
      const response = await fetch("/api/premium-search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reportId, token: accessToken, retry })
      });
      const result = (await response.json().catch(() => null)) as { status?: string; offerCount?: number; error?: string; retryAvailable?: boolean } | null;

      if (!response.ok) {
        setError(result?.error ?? "The premium search could not run. Please contact support with this report id.");
        setIsRunning(false);
        return;
      }

      if (result?.status === "completed") {
        setMessage("Premium search completed. Loading your leads...");
        window.location.reload();
        return;
      }

      if (result?.status === "running") {
        setMessage("Your premium search is already running. Refresh this page in a moment to check the result.");
        setIsRunning(false);
        return;
      }

      setMessage("Premium search status updated. Refresh this page in a moment to check the result.");
      setIsRunning(false);
    } catch {
      setError("The premium search could not start. Please contact support with this report id.");
      setIsRunning(false);
    }
  }

  useEffect(() => {
    if (!autoStart) return;
    void runSearch();
  }, [autoStart]);

  return (
    <div className="mt-8 max-w-2xl rounded-lg border border-emerald-100 bg-white p-8 shadow-soft">
      <p className="text-sm font-semibold uppercase text-signal">Live search</p>
      <h1 className="mt-3 text-4xl font-bold text-ink">{retry ? "Retry your premium search" : "Finding your premium leads"}</h1>
      <p className="mt-4 text-ink/70">{message}</p>
      {error ? <p className="mt-4 rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}
      {autoStart ? (
        <button type="button" onClick={() => window.location.reload()} className="mt-6 inline-flex button-secondary">
          Refresh status
        </button>
      ) : (
        <button type="button" onClick={() => void runSearch()} disabled={isRunning} className="mt-6 inline-flex button-primary disabled:cursor-not-allowed disabled:opacity-60">
          {isRunning ? "Retrying..." : "Retry premium search"}
        </button>
      )}
    </div>
  );
}
