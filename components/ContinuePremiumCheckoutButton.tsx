"use client";

import { useState } from "react";

export function ContinuePremiumCheckoutButton({ reportId, accessToken }: { reportId: string; accessToken?: string }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function continueToCheckout() {
    setLoading(true);
    setError("");

    const response = await fetch("/api/create-premium-checkout-session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reportId, token: accessToken })
    });
    const result = (await response.json().catch(() => null)) as { url?: string; error?: string } | null;

    if (!response.ok || !result?.url) {
      setError(result?.error ?? "We could not reopen checkout. Please try again.");
      setLoading(false);
      return;
    }

    window.location.href = result.url;
  }

  return (
    <div className="mt-6">
      {error ? <p className="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}
      <button type="button" onClick={() => void continueToCheckout()} disabled={loading} className="inline-flex button-primary disabled:cursor-not-allowed disabled:opacity-60">
        {loading ? "Opening checkout..." : "Continue to payment"}
      </button>
    </div>
  );
}
