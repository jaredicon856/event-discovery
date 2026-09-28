"use client";

import { useState } from "react";

function downloadBase64Pdf(base64: string, filename: string) {
  const byteChars = atob(base64);
  const byteNumbers = new Array(byteChars.length);
  for (let i = 0; i < byteChars.length; i++) byteNumbers[i] = byteChars.charCodeAt(i);
  const blob = new Blob([new Uint8Array(byteNumbers)], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export function ExportPdfButton({ filters }: { filters: Record<string, string> }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleExport() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/export/pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filters }),
      });
      const json = await response.json();
      if (!response.ok || !json.pdfBase64) {
        setError(json.error ?? "Export failed");
        return;
      }
      downloadBase64Pdf(json.pdfBase64, json.filename ?? "EventScout.pdf");
    } catch {
      setError("Export failed — request error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={handleExport}
        disabled={busy}
        className="premium-button flex items-center border border-icon-primary text-icon-primary hover:bg-icon-primary-light disabled:cursor-wait disabled:opacity-60"
      >
        {busy ? "Preparing PDF…" : "Export PDF"}
      </button>
      {error && <p role="alert" className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
