export const LEGAL_UPDATED = "19 November 2026";

/** Bump this whenever the Terms or Privacy Policy change in a way people must re-accept. */
export const LEGAL_VERSION = "2026-11-19";

/** Public contact address for privacy and legal requests. Set NEXT_PUBLIC_LEGAL_CONTACT_EMAIL in Vercel. */
export const LEGAL_CONTACT_EMAIL = process.env.NEXT_PUBLIC_LEGAL_CONTACT_EMAIL?.trim() || null;
