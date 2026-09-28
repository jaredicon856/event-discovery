if (typeof window !== "undefined") {
  throw new Error("src/lib/email/resend.ts must not be imported from a Client Component module.");
}

import { readFile } from "node:fs/promises";
import path from "node:path";
import { Resend } from "resend";

const DEFAULT_FROM = "Event Scout <support@mail.projecticon.io>";
const DEFAULT_REPLY_TO = "admin@projecticon.io";

/** Inline CID for the brand mark attachment. */
export const EMAIL_LOGO_CID = "icon-mark";

let client: Resend | null = null;
let logoBuffer: Buffer | null = null;

function getResend(): Resend {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("RESEND_API_KEY is not configured");
  }
  if (!client) client = new Resend(apiKey);
  return client;
}

export function emailFromAddress(): string {
  const configured = process.env.RESEND_FROM?.trim();
  // Unquoted env values with spaces can truncate to "Event" — fall back if invalid.
  if (configured && /.+@.+\..+/.test(configured)) return configured;
  return DEFAULT_FROM;
}

export function emailReplyTo(): string {
  return process.env.RESEND_REPLY_TO?.trim() || DEFAULT_REPLY_TO;
}

export function ownerAlertEmail(): string {
  return process.env.RESEND_OWNER_EMAIL?.trim() || DEFAULT_REPLY_TO;
}

export function appOrigin(fallback?: string): string {
  return (process.env.NEXT_PUBLIC_APP_URL ?? fallback ?? "http://localhost:3000").replace(/\/$/, "");
}

export function brandLogoUrl(origin?: string): string {
  const configured = process.env.RESEND_LOGO_URL?.trim();
  if (configured) return configured;
  return `${appOrigin(origin)}/brand/icon-mark-square.png`;
}

async function brandLogoAttachment(): Promise<{
  filename: string;
  content: Buffer;
  contentId: string;
} | null> {
  try {
    if (!logoBuffer) {
      logoBuffer = await readFile(
        path.join(process.cwd(), "public/brand/icon-mark-email.png")
      ).catch(() =>
        readFile(path.join(process.cwd(), "public/brand/icon-mark-square.png"))
      );
    }
    return {
      filename: "icon-mark.png",
      content: logoBuffer,
      contentId: EMAIL_LOGO_CID,
    };
  } catch {
    return null;
  }
}

export type SendEmailInput = {
  to: string | string[];
  subject: string;
  html: string;
  text: string;
  replyTo?: string;
  tags?: Array<{ name: string; value: string }>;
  /** Extra file attachments (invoice PDFs, etc). Logo CID is always included when available. */
  files?: Array<{ filename: string; content: Buffer }>;
};

export async function sendEmail(input: SendEmailInput): Promise<{ id: string }> {
  const resend = getResend();
  const logo = await brandLogoAttachment();
  const attachments = [
    ...(logo
      ? [
          {
            filename: logo.filename,
            content: logo.content,
            contentId: logo.contentId,
          },
        ]
      : []),
    ...(input.files ?? []).map((file) => ({
      filename: file.filename,
      content: file.content,
    })),
  ];
  const { data, error } = await resend.emails.send({
    from: emailFromAddress(),
    to: input.to,
    replyTo: input.replyTo ?? emailReplyTo(),
    subject: input.subject,
    html: input.html,
    text: input.text,
    tags: input.tags,
    attachments: attachments.length > 0 ? attachments : undefined,
  });

  if (error || !data?.id) {
    throw new Error(error?.message ?? "Resend did not accept the message");
  }
  return { id: data.id };
}
