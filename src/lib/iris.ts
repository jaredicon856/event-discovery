export interface IrisDocument {
  type: "event_scout_pdf" | "event_scout_output";
  filename: string;
  mimeType: string;
  base64: string;
  generatedAt: string;
}

export interface IrisAttachResult {
  ok: boolean;
  attached: boolean;
  reason?: string;
  clientName?: string;
  error?: string;
}

/**
 * Pushes document(s) to the Iris sales app's client-documents ingest
 * endpoint. Server-side only — BC_INGEST_SECRET must never reach the browser.
 * Iris matches purely on clientEmail against existing ops_clients and never
 * creates a new client; re-pushing the same `type` for a client replaces the
 * previous file on their Documents tab.
 */
export async function attachDocumentsToIris(params: {
  clientEmail: string;
  clientName?: string;
  documents: IrisDocument[];
}): Promise<IrisAttachResult> {
  const secret = process.env.BC_INGEST_SECRET;
  const url = process.env.IRIS_INGEST_URL || "https://icon-sales-app.vercel.app/api/ingest/client-documents";

  if (!secret) {
    return { ok: false, attached: false, error: "BC_INGEST_SECRET is not configured on the server" };
  }

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${secret}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        clientEmail: params.clientEmail,
        clientName: params.clientName,
        documents: params.documents,
      }),
    });

    const json = await res.json().catch(() => null);

    if (!res.ok) {
      return {
        ok: false,
        attached: false,
        error: (json && (json.error || json.message)) || `Iris responded ${res.status}`,
      };
    }

    return {
      ok: true,
      attached: Boolean(json?.attached),
      reason: json?.reason,
      clientName: json?.clientName,
    };
  } catch (e) {
    return { ok: false, attached: false, error: e instanceof Error ? e.message : "Iris request failed" };
  }
}
