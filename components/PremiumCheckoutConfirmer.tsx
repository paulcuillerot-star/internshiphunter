"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

export function PremiumCheckoutConfirmer({ reportId, accessToken, sessionId }: { reportId: string; accessToken?: string; sessionId: string }) {
  const router = useRouter();
  const started = useRef(false);
  const terminalNavigation = useRef(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("Stripe sent you back successfully. We are securely confirming your Checkout session.");
  const cleanPremiumUrl = useMemo(() => {
    const params = new URLSearchParams();
    if (accessToken) params.set("token", accessToken);
    params.set("refresh", String(Date.now()));
    return `/premium/${reportId}?${params.toString()}`;
  }, [accessToken, reportId]);

  const forceFreshPremiumPage = useCallback(() => {
    if (terminalNavigation.current) return;
    terminalNavigation.current = true;
    router.replace(cleanPremiumUrl);
    router.refresh();
    window.setTimeout(() => {
      window.location.assign(cleanPremiumUrl);
    }, 300);
  }, [cleanPremiumUrl, router]);

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    async function confirmSession() {
      const response = await fetch("/api/confirm-premium-checkout-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reportId, token: accessToken, sessionId })
      });
      const result = (await response.json().catch(() => null)) as { status?: string; error?: string } | null;

      if (!response.ok || result?.status !== "paid") {
        setError(result?.error ?? "Could not confirm the Stripe Checkout session yet.");
        return;
      }

      setMessage("Payment confirmed. Loading your premium search... We are refreshing your report with the latest payment status.");
      forceFreshPremiumPage();
    }

    confirmSession().catch(() => setError("Could not confirm the Stripe Checkout session yet."));
  }, [accessToken, cleanPremiumUrl, forceFreshPremiumPage, reportId, router, sessionId]);

  return (
    <section className="section">
      <div className="max-w-2xl rounded-lg border border-emerald-100 bg-white p-8 shadow-soft">
        <p className="text-sm font-semibold uppercase text-signal">Payment confirmed</p>
        <h1 className="mt-3 text-4xl font-bold text-ink">Unlocking your report...</h1>
        <p className="mt-4 text-ink/70">{message}</p>
        {error ? <p className="mt-4 rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}
        <a href={cleanPremiumUrl} className="mt-6 inline-flex button-primary">
          Refresh unlock status
        </a>
      </div>
    </section>
  );
}
