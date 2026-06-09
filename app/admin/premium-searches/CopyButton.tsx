"use client";

import { useState } from "react";

export function CopyButton({ value, label = "Copy report ID" }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  return (
    <button type="button" onClick={copy} className="rounded-md border border-line bg-white px-3 py-2 text-sm font-bold text-ink">
      {copied ? "Copied" : label}
    </button>
  );
}
