"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function ImpersonationBanner({ targetEmail }: { targetEmail: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function stop() {
    setBusy(true);
    try {
      await fetch("/api/admin/impersonate", { method: "DELETE" });
    } finally {
      router.push("/admin");
      router.refresh();
    }
  }

  return (
    <div className="fixed inset-x-0 top-0 z-[60] flex h-11 items-center justify-center gap-4 bg-amber-500 px-4 text-sm font-semibold text-amber-950 shadow-md">
      <span>
        Viewing as <strong>{targetEmail}</strong>
      </span>
      <button
        type="button"
        onClick={stop}
        disabled={busy}
        className="cursor-pointer rounded-lg bg-amber-950/10 px-3 py-1 text-xs font-bold uppercase tracking-wide hover:bg-amber-950/20 disabled:opacity-60"
      >
        {busy ? "Returning…" : "Return to admin"}
      </button>
    </div>
  );
}
