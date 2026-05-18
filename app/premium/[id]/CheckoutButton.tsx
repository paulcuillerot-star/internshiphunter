"use client";

import { useState } from "react";

export function CheckoutButton({ reportId }: { reportId: string }) {
  const [loading, setLoading] = useState(false);
  async function checkout() {
    setLoading(true);
    const response = await fetch("/api/create-checkout-session", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reportId }) });
    const data = (await response.json()) as { url: string };
    window.location.href = data.url;
  }
  return <button type="button" onClick={checkout} disabled={loading} className="mt-6 button-primary">{loading ? "Opening checkout..." : "Continue to checkout"}</button>;
}
