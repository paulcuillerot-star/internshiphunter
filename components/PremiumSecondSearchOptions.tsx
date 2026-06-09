"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const strategies = [
  { id: "broaden_locations", label: "Broaden locations", description: "Search nearby cities or the same country more broadly." },
  { id: "broaden_roles", label: "Broaden roles", description: "Include adjacent business roles in the same career family." },
  { id: "relax_one_hard_filter", label: "Relax one hard filter", description: "Keep the spirit of your filters, but soften the least critical one." },
  { id: "include_nearby_industries", label: "Include nearby industries", description: "Look beyond your preferred industries while keeping role fit strong." },
  { id: "broader_company_sources", label: "Search broader company sources", description: "Try more direct employer and ATS sources without accepting weak job boards." }
] as const;

type StrategyId = (typeof strategies)[number]["id"];

function cleanPremiumUrl(reportId: string, accessToken?: string) {
  const params = new URLSearchParams();
  if (accessToken) params.set("token", accessToken);
  params.set("refresh", String(Date.now()));
  return `/premium/${reportId}?${params.toString()}`;
}

export function PremiumSecondSearchOptions({ reportId, accessToken }: { reportId: string; accessToken?: string }) {
  const router = useRouter();
  const [selected, setSelected] = useState<StrategyId>("broaden_locations");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function launchSecondSearch() {
    setLoading(true);
    setError("");

    const response = await fetch("/api/premium-search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reportId, token: accessToken, retry: true, broadeningStrategy: selected })
    });
    const result = (await response.json().catch(() => null)) as { status?: string; error?: string } | null;

    if (!response.ok && result?.status !== "failed") {
      setError(result?.error ?? "The second search could not start. Please try again.");
      setLoading(false);
      return;
    }

    const target = cleanPremiumUrl(reportId, accessToken);
    router.replace(target);
    router.refresh();
    window.setTimeout(() => window.location.assign(target), 300);
  }

  return (
    <div className="mt-6 rounded-2xl border border-line bg-mist p-4">
      <p className="text-sm font-black text-ink">Want to try one broader pass?</p>
      <p className="mt-2 text-sm leading-6 text-ink/65">Choose what you are willing to relax. We will not broaden everything automatically.</p>
      <div className="mt-4 grid gap-2">
        {strategies.map((strategy) => (
          <label key={strategy.id} className={`cursor-pointer rounded-2xl border bg-white p-4 ${selected === strategy.id ? "border-signal ring-2 ring-signal/20" : "border-line"}`}>
            <span className="flex items-start gap-3">
              <input type="radio" name="broadeningStrategy" className="mt-1 h-4 w-4 accent-emerald-600" checked={selected === strategy.id} onChange={() => setSelected(strategy.id)} />
              <span>
                <span className="block text-sm font-black text-ink">{strategy.label}</span>
                <span className="mt-1 block text-sm leading-5 text-ink/60">{strategy.description}</span>
              </span>
            </span>
          </label>
        ))}
      </div>
      {error ? <p className="mt-4 rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}
      <button type="button" onClick={() => void launchSecondSearch()} disabled={loading} className="mt-5 inline-flex button-primary disabled:cursor-not-allowed disabled:opacity-60">
        {loading ? "Starting broader search..." : "Launch second search"}
      </button>
    </div>
  );
}
