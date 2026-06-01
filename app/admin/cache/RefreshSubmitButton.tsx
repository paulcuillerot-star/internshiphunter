"use client";

import { useFormStatus } from "react-dom";

export function RefreshSubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button className="button-primary" type="submit" disabled={pending}>
      {pending ? "Refreshing..." : "Refresh selected buckets"}
    </button>
  );
}
