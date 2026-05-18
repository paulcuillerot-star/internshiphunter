"use client";

import { useState } from "react";
import type { FeedbackType } from "@/lib/types";

const options: Array<{ label: string; value: FeedbackType }> = [
  { label: "Relevant", value: "relevant" },
  { label: "Not relevant", value: "not_relevant" },
  { label: "Expired", value: "expired" },
  { label: "Wrong country", value: "wrong_country" },
  { label: "Too senior", value: "too_senior" }
];

export function FeedbackButtons({ reportId, offerId }: { reportId: string; offerId: string }) {
  const [selected, setSelected] = useState<FeedbackType | null>(null);
  async function submit(feedbackType: FeedbackType) {
    setSelected(feedbackType);
    await fetch("/api/feedback", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reportId, offerId, feedbackType }) });
  }
  return <div className="flex flex-wrap gap-2 pt-3">{options.map((option) => <button key={option.value} type="button" onClick={() => submit(option.value)} className={`rounded-md border px-3 py-1.5 text-xs font-medium transition ${selected === option.value ? "border-signal bg-signal text-white" : "border-line bg-white text-ink hover:border-ink"}`}>{option.label}</button>)}</div>;
}
