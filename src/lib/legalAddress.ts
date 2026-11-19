if (typeof window !== "undefined") {
  throw new Error("src/lib/legalAddress.ts must not be imported from a Client Component module.");
}

/** Company mailing address shown in email footers and the Privacy Policy. Set LEGAL_POSTAL_ADDRESS in Vercel. */
export function legalPostalAddress(): string | null {
  return process.env.LEGAL_POSTAL_ADDRESS?.trim() || null;
}
