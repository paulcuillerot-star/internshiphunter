"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { PremiumSearchStatus } from "@/lib/types";

type StatusResponse = { status?: PremiumSearchStatus; offerCount?: number; error?: string };

export function PremiumSearchRunner({
  reportId,
  accessToken,
  retry = false,
  autoStart = true,
  pollOnly = false
}: {
  reportId: string;
  accessToken?: string;
  retry?: boolean;
  autoStart?: boolean;
  pollOnly?: boolean;
}) {
  const router = useRouter();
  const started = useRef(false);
  const pollTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const [message, setMessage] = useState(
    pollOnly ? "Your premium search is running. We are checking the status quietly." : retry ? "Ready to retry with broader criteria." : "Running your live search... this can take 30-60 seconds."
  );
  const [error, setError] = useState("");
  const [isRunning, setIsRunning] = useState(false);
  const [isPolling, setIsPolling] = useState(pollOnly);

  const refreshPage = useCallback(() => {
    router.refresh();
  }, [router]);

  const buildStatusUrl = useCallback(() => {
    const params = new URLSearchParams({ reportId });
    if (accessToken) params.set("token", accessToken);
    return `/api/premium-search-status?${params.toString()}`;
  }, [accessToken, reportId]);

  const clearPoll = useCallback(() => {
    if (pollTimer.current) {
      clearInterval(pollTimer.current);
      pollTimer.current = null;
    }
  }, []);

  const checkStatus = useCallback(async () => {
    const response = await fetch(buildStatusUrl());
    const result = (await response.json().catch(() => null)) as StatusResponse | null;

    if (!response.ok) {
      setError(result?.error ?? "Could not check premium search status.");
      setIsPolling(false);
      clearPoll();
      return;
    }

    if (result?.status === "completed") {
      setMessage("Premium search completed. Loading your leads...");
      setIsPolling(false);
      clearPoll();
      refreshPage();
      return;
    }

    if (result?.status === "failed") {
      setMessage("Premium search finished with an issue. Loading the recovery options...");
      setIsPolling(false);
      clearPoll();
      refreshPage();
      return;
    }

    if (result?.status === "running") {
      setMessage("Your premium search is running. This can take 30-60 seconds.");
      return;
    }

    if (result?.status === "pending_payment") {
      setMessage("Waiting for payment confirmation before starting the search.");
      setIsPolling(false);
      clearPoll();
      refreshPage();
    }
  }, [buildStatusUrl, clearPoll, refreshPage]);

  const startPolling = useCallback(() => {
    if (pollTimer.current) return;
    setIsPolling(true);
    void checkStatus();
    pollTimer.current = setInterval(() => {
      void checkStatus();
    }, 2500);
  }, [checkStatus]);

  const runSearch = useCallback(async () => {
    if (started.current || pollOnly) return;
    started.current = true;
    setIsRunning(true);
    setError("");
    setMessage(retry ? "Retrying with broader criteria... this can take 30-60 seconds." : "Starting your live search...");

    try {
      const response = await fetch("/api/premium-search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reportId, token: accessToken, retry })
      });
      const result = (await response.json().catch(() => null)) as StatusResponse & { retryAvailable?: boolean } | null;

      if (!response.ok) {
        setError(result?.error ?? "The premium search could not run. Please contact support with this report id.");
        setIsRunning(false);
        return;
      }

      if (result?.status === "completed") {
        setMessage("Premium search completed. Loading your leads...");
        setIsRunning(false);
        refreshPage();
        return;
      }

      if (result?.status === "running") {
        setMessage("Your premium search is running. We will check for the result automatically.");
        setIsRunning(false);
        startPolling();
        return;
      }

      setMessage("Premium search status updated. We will check for the result automatically.");
      setIsRunning(false);
      startPolling();
    } catch {
      setError("The premium search could not start. Please contact support with this report id.");
      setIsRunning(false);
    }
  }, [accessToken, pollOnly, refreshPage, reportId, retry, startPolling]);

  useEffect(() => {
    if (pollOnly) {
      startPolling();
      return;
    }

    if (autoStart) {
      void runSearch();
    }
  }, [autoStart, pollOnly, runSearch, startPolling]);

  useEffect(() => clearPoll, [clearPoll]);

  return (
    <div className="mt-8 max-w-2xl rounded-lg border border-emerald-100 bg-white p-8 shadow-soft">
      <p className="text-sm font-semibold uppercase text-signal">Live search</p>
      <h1 className="mt-3 text-4xl font-bold text-ink">{retry ? "Retry your premium search" : pollOnly ? "Checking your premium search" : "Finding your premium leads"}</h1>
      <p className="mt-4 text-ink/70">{message}</p>
      {error ? <p className="mt-4 rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}
      {autoStart || pollOnly ? (
        <button type="button" onClick={refreshPage} className="mt-6 inline-flex button-secondary">
          Refresh status
        </button>
      ) : (
        <button type="button" onClick={() => void runSearch()} disabled={isRunning || isPolling} className="mt-6 inline-flex button-primary disabled:cursor-not-allowed disabled:opacity-60">
          {isRunning || isPolling ? "Retrying..." : "Retry with broader criteria"}
        </button>
      )}
    </div>
  );
}
