"use client";

import { useState } from "react";

type Toast = { type: "success" | "error"; message: string } | null;

function downloadBase64Pdf(base64: string, filename: string) {
  const byteChars = atob(base64);
  const byteNumbers = new Array(byteChars.length);
  for (let i = 0; i < byteChars.length; i++) byteNumbers[i] = byteChars.charCodeAt(i);
  const blob = new Blob([new Uint8Array(byteNumbers)], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function IrisExportButton({ filters }: { filters: Record<string, string> }) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState<Toast>(null);

  function closeModal() {
    setOpen(false);
    setEmail("");
    setName("");
  }

  async function handleExport() {
    const trimmedEmail = email.trim();
    if (!trimmedEmail) return;
    setSubmitting(true);
    setToast(null);
    try {
      const res = await fetch("/api/export/pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientEmail: trimmedEmail,
          clientName: name.trim() || undefined,
          filters,
        }),
      });
      const json = await res.json();

      if (!res.ok) {
        setToast({ type: "error", message: json.error ?? "Export failed" });
        return;
      }

      if (json.pdfBase64) {
        downloadBase64Pdf(json.pdfBase64, json.filename ?? "EventScout.pdf");
      }

      if (json.attached) {
        setToast({ type: "success", message: `Attached to Iris: ${json.clientName || name.trim() || trimmedEmail}` });
        closeModal();
      } else if (json.reason === "no_matching_client") {
        setToast({
          type: "error",
          message: "No Iris client found with that email. Fix the email or add the client in Ops / Iris first.",
        });
      } else {
        setToast({
          type: "error",
          message: json.irisError
            ? `PDF downloaded, but couldn't attach to Iris: ${json.irisError}`
            : "PDF downloaded, but couldn't attach to Iris.",
        });
      }
    } catch {
      setToast({ type: "error", message: "Export failed — request error" });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded border border-icon-primary px-4 py-2 text-sm font-medium text-icon-primary hover:bg-icon-primary-light"
      >
        Export PDF
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-icon-blur p-4"
          onClick={() => !submitting && closeModal()}
        >
          <div
            className="w-full max-w-sm rounded-lg border border-icon-border bg-icon-background p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-sm font-semibold text-icon-text">Attach to Iris client</h2>
            <p className="mt-1 text-xs font-medium text-icon-text-light">
              Matches an existing Iris client by email. This never creates a new client.
            </p>

            <div className="mt-4 flex flex-col gap-3">
              <label className="flex flex-col gap-1">
                <span className="text-xs font-semibold uppercase text-icon-text-light">
                  Client email <span className="text-icon-primary">*</span>
                </span>
                <input
                  type="email"
                  autoFocus
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="client@example.com"
                  className="rounded border border-icon-border bg-icon-surface px-3 py-1.5 text-sm font-medium text-icon-text"
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs font-semibold uppercase text-icon-text-light">
                  Client name <span className="font-normal normal-case text-icon-text-light">(optional)</span>
                </span>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="For the filename / display only"
                  className="rounded border border-icon-border bg-icon-surface px-3 py-1.5 text-sm font-medium text-icon-text"
                />
              </label>
            </div>

            <div className="mt-5 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={closeModal}
                disabled={submitting}
                className="rounded border border-icon-border px-3 py-1.5 text-sm font-medium text-icon-text-light hover:bg-icon-surface disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleExport}
                disabled={submitting || !email.trim()}
                className="rounded bg-icon-primary px-3 py-1.5 text-sm font-medium text-icon-background hover:brightness-110 disabled:opacity-50"
              >
                {submitting ? "Exporting…" : "Export & attach to Iris"}
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div
          className={`fixed bottom-6 right-6 z-[60] max-w-sm rounded-lg border px-4 py-3 text-sm font-medium shadow-lg ${
            toast.type === "success"
              ? "border-emerald-700 bg-emerald-950/90 text-emerald-300"
              : "border-red-800 bg-red-950/90 text-red-300"
          }`}
        >
          <div className="flex items-start justify-between gap-3">
            <span>{toast.message}</span>
            <button
              type="button"
              onClick={() => setToast(null)}
              className="text-xs font-semibold text-current opacity-70 hover:opacity-100"
            >
              ✕
            </button>
          </div>
        </div>
      )}
    </>
  );
}
