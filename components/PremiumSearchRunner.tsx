"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { PremiumSearchStatus } from "@/lib/types";

type StatusResponse = { status?: PremiumSearchStatus; offerCount?: number; error?: string };

function LoadingBar() {
  return (
    <div className="mt-6 overflow-hidden rounded-full bg-emerald-50 ring-1 ring-emerald-100">
      <div className="h-2 w-1/3 animate-[pulse_1.2s_ease-in-out_infinite] rounded-full bg-signal shadow-[0_0_20px_rgba(16,185,129,0.35)]" />
    </div>
  );
}

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
  const terminalNavigation = useRef(false);
  const [message, setMessage] = useState(
    pollOnly ? "Searching live internship sources. This can take up to a minute." : retry ? "Ready to retry with broader criteria." : "Starting your live search..."
  );
  const [error, setError] = useState("");
  const [isRunning, setIsRunning] = useState(false);
  const [isPolling, setIsPolling] = useState(pollOnly);

  const cleanPremiumUrl = useCallback(() => {
    const params = new URLSearchParams();
    if (accessToken) params.set("token", accessToken);
    params.set("refresh", String(Date.now()));
    return `/premium/${reportId}?${params.toString()}`;
  }, [accessToken, reportId]);

  const navigateToCleanPremiumUrl = useCallback(() => {
    router.replace(cleanPremiumUrl());
  }, [cleanPremiumUrl, router]);

  const forceTerminalReload = useCallback(() => {
    if (terminalNavigation.current) return;
    terminalNavigation.current = true;
    const cleanUrl = cleanPremiumUrl();
    router.replace(cleanUrl);
    router.refresh();
    window.setTimeout(() => {
      window.location.assign(cleanUrl);
    }, 300);
  }, [cleanPremiumUrl, router]);

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
      forceTerminalReload();
      return;
    }

    if (result?.status === "failed") {
      setMessage("Premium search finished with an issue. Loading recovery options...");
      setIsPolling(false);
      clearPoll();
      forceTerminalReload();
      return;
    }

    if (result?.status === "running") {
      setMessage("Searching live internship sources. This can take up to a minute.");
      return;
    }

    if (result?.status === "pending_payment") {
      setMessage("Waiting for payment confirmation before starting the search.");
      setIsPolling(false);
      clearPoll();
      forceTerminalReload();
    }
  }, [buildStatusUrl, clearPoll, forceTerminalReload]);

  const startPolling = useCallback(() => {
    if (pollTimer.current) return;
    setIsPolling(true);
    setMessage("Searching live internship sources. This can take up to a minute.");
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
    setMessage("Starting your live search...");

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
        forceTerminalReload();
        return;
      }

      if (result?.status === "failed") {
        setMessage("Premium search finished with an issue. Loading recovery options...");
        setIsRunning(false);
        forceTerminalReload();
        return;
      }

      if (result?.status === "running") {
        setMessage("Searching live internship sources. This can take up to a minute.");
        setIsRunning(false);
        startPolling();
        return;
      }

      setMessage("Searching live internship sources. This can take up to a minute.");
      setIsRunning(false);
      startPolling();
    } catch {
      setError("The premium search could not start. Please contact support with this report id.");
      setIsRunning(false);
    }
  }, [accessToken, forceTerminalReload, pollOnly, reportId, retry, startPolling]);

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

  const active = autoStart || pollOnly || isRunning || isPolling;

  return (
    <div className="mt-8 max-w-2xl rounded-lg border border-emerald-100 bg-white p-8 shadow-soft">
      <p className="text-sm font-semibold uppercase text-signal">Live search</p>
      <h1 className="mt-3 text-4xl font-bold text-ink">{retry ? "Retry your premium search" : pollOnly ? "Checking your premium search" : "Finding your premium leads"}</h1>
      <p className="mt-4 text-ink/70">{message}</p>
      {active ? <LoadingBar /> : null}
      {active ? <p className="mt-3 text-sm font-semibold text-ink/55">We are checking automatically. You can keep this page open.</p> : null}
      {error ? <p className="mt-4 rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}
      {autoStart || pollOnly ? (
        <button type="button" onClick={navigateToCleanPremiumUrl} className="mt-6 inline-flex button-secondary text-sm">
          Refresh status manually
        </button>
      ) : (
        <button type="button" onClick={() => void runSearch()} disabled={isRunning || isPolling} className="mt-6 inline-flex button-primary disabled:cursor-not-allowed disabled:opacity-60">
          {isRunning || isPolling ? "Retrying..." : "Retry with broader criteria"}
        </button>
      )}
    </div>
  );
}
