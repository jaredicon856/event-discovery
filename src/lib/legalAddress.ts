if (typeof window !== "undefined") {
  throw new Error("src/lib/legalAddress.ts must not be imported from a Client Component module.");
}

/** Company mailing address shown in email footers and the Privacy Policy. Set LEGAL_POSTAL_ADDRESS in Vercel. */
export function legalPostalAddress(): string | null {
  return process.env.LEGAL_POSTAL_ADDRESS?.trim() || null;
}

/** Public contact for privacy and legal requests: the dedicated setting, else the reply-to address every email already uses. */
export function legalContactEmail(): string | null {
  return process.env.NEXT_PUBLIC_LEGAL_CONTACT_EMAIL?.trim() || process.env.RESEND_REPLY_TO?.trim() || null;
}
