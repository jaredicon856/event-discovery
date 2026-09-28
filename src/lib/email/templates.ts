if (typeof window !== "undefined") {
  throw new Error("src/lib/email/templates.ts must not be imported from a Client Component module.");
}

import { EMAIL_LOGO_CID, emailReplyTo } from "@/lib/email/resend";

const COLORS = {
  gold: "#b88932",
  goldSoft: "#d4a84b",
  ink: "#121816",
  muted: "#6b736f",
  line: "#eceae4",
  white: "#ffffff",
  wash: "#faf9f6",
} as const;

type ShellInput = {
  preheader: string;
  title: string;
  bodyHtml: string;
  ctaLabel?: string;
  ctaUrl?: string;
  footerNote?: string;
  /** Prefer CID so the mark renders without a public host. */
  logoSrc?: string;
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function shell(input: ShellInput): string {
  const logoSrc = input.logoSrc ?? `cid:${EMAIL_LOGO_CID}`;
  const cta =
    input.ctaLabel && input.ctaUrl
      ? `
      <tr>
        <td style="padding:32px 0 0;" align="center">
          <a href="${escapeHtml(input.ctaUrl)}"
             class="es-cta"
             style="display:inline-block;background:${COLORS.gold};color:${COLORS.white};font-family:Georgia,'Times New Roman',serif;font-size:15px;font-weight:600;letter-spacing:0.04em;text-decoration:none;padding:15px 32px;border-radius:999px;">
            ${escapeHtml(input.ctaLabel)}
          </a>
        </td>
      </tr>`
      : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="color-scheme" content="light" />
  <meta name="supported-color-schemes" content="light" />
  <title>${escapeHtml(input.title)}</title>
  <style>
    @media (prefers-reduced-motion: no-preference) {
      .es-fade {
        animation: esFade 0.85s cubic-bezier(.22,1,.36,1) both;
      }
      .es-shimmer-glide {
        animation: esGlide 2.4s ease-in-out infinite;
      }
      .es-cta {
        transition: transform 0.2s ease, box-shadow 0.2s ease;
      }
    }
    @keyframes esFade {
      from { opacity: 0; transform: translateY(10px); }
      to { opacity: 1; transform: none; }
    }
    @keyframes esGlide {
      0% { transform: translateX(-120%); }
      100% { transform: translateX(220%); }
    }
  </style>
</head>
<body style="margin:0;padding:0;background:${COLORS.white};">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">
    ${escapeHtml(input.preheader)}
  </div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${COLORS.white};">
    <tr>
      <td align="center" style="padding:48px 24px 56px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;" class="es-fade">
          <tr>
            <td align="center" style="padding:0 0 28px;">
              <img src="${escapeHtml(logoSrc)}" width="44" height="44" alt="ICON" style="display:block;border:0;border-radius:12px;" />
              <div style="margin-top:18px;font-family:Georgia,'Times New Roman',serif;font-size:13px;letter-spacing:0.28em;text-transform:uppercase;color:${COLORS.gold};">
                Event Scout
              </div>
            </td>
          </tr>
          <tr>
            <td style="padding:0 0 36px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="height:1px;background:${COLORS.line};font-size:0;line-height:0;">&nbsp;</td>
                </tr>
                <tr>
                  <td style="height:2px;overflow:hidden;background:${COLORS.wash};font-size:0;line-height:0;">
                    <div class="es-shimmer-glide" style="width:36%;height:2px;background:linear-gradient(90deg,transparent,${COLORS.goldSoft},${COLORS.gold},transparent);">&nbsp;</div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="color:${COLORS.ink};">
              <h1 style="margin:0;font-family:Georgia,'Times New Roman',serif;font-size:32px;line-height:1.2;font-weight:500;letter-spacing:-0.03em;color:${COLORS.ink};text-align:center;">
                ${escapeHtml(input.title)}
              </h1>
              <div style="margin:18px auto 0;max-width:400px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,sans-serif;font-size:15px;line-height:1.7;color:${COLORS.muted};text-align:center;">
                ${input.bodyHtml}
              </div>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                ${cta}
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:40px 0 0;text-align:center;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,sans-serif;font-size:12px;line-height:1.65;color:${COLORS.muted};">
              ${
                input.footerNote ??
                `Questions? Reply anytime — <a href="mailto:${escapeHtml(emailReplyTo())}" style="color:${COLORS.gold};text-decoration:none;">${escapeHtml(emailReplyTo())}</a>`
              }
              <div style="margin-top:10px;letter-spacing:0.04em;">Project ICON</div>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export function invitationEmail(input: {
  toEmail: string;
  acceptUrl: string;
  expiresAt: string;
}): { subject: string; html: string; text: string } {
  const expiresLabel = new Date(input.expiresAt).toLocaleString("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "America/New_York",
  });
  const subject = "You're invited to Event Scout";
  const html = shell({
    preheader: "Your invitation to Event Scout is ready.",
    title: "You're invited",
    bodyHtml: `
      <p style="margin:0 0 12px;">A private seat in Event Scout is waiting for <strong style="color:${COLORS.ink};">${escapeHtml(input.toEmail)}</strong>.</p>
      <p style="margin:0;">This link expires ${escapeHtml(expiresLabel)} ET.</p>
    `,
    ctaLabel: "Accept invitation",
    ctaUrl: input.acceptUrl,
  });
  const text = [
    "You're invited to Event Scout",
    "",
    `A private seat is waiting for ${input.toEmail}.`,
    input.acceptUrl,
    "",
    `Expires ${expiresLabel} ET.`,
    "",
    `Questions? ${emailReplyTo()}`,
  ].join("\n");
  return { subject, html, text };
}

export function accessRequestAlertEmail(input: {
  requesterEmail: string;
  requesterName?: string | null;
  message?: string | null;
}): { subject: string; html: string; text: string } {
  const name = input.requesterName?.trim() || "Someone";
  const subject = `Access request: ${input.requesterEmail}`;
  const messageBlock = input.message?.trim()
    ? `<p style="margin:16px 0 0;padding:14px 16px;border-left:2px solid ${COLORS.gold};text-align:left;color:${COLORS.ink};">${escapeHtml(input.message.trim())}</p>`
    : "";

  const html = shell({
    preheader: `${name} requested Event Scout access.`,
    title: "New access request",
    bodyHtml: `
      <p style="margin:0;"><strong style="color:${COLORS.ink};">${escapeHtml(name)}</strong><br />
      <a href="mailto:${escapeHtml(input.requesterEmail)}" style="color:${COLORS.gold};text-decoration:none;">${escapeHtml(input.requesterEmail)}</a></p>
      ${messageBlock}
    `,
    footerNote: `Reply to reach them directly, or invite from Admin. Alerts also copy to ${escapeHtml(emailReplyTo())}.`,
  });
  const text = [
    "New Event Scout access request",
    "",
    `Name: ${name}`,
    `Email: ${input.requesterEmail}`,
    input.message?.trim() ? `Message:\n${input.message.trim()}` : "",
    "",
    "Reply to this email or send an invitation from Admin.",
  ]
    .filter(Boolean)
    .join("\n");
  return { subject, html, text };
}

function ownerAlertRows(rows: Array<[string, string | null | undefined]>): string {
  return rows
    .filter(([, value]) => value)
    .map(
      ([label, value]) =>
        `<tr><td style="padding:6px 12px 6px 0;color:${COLORS.muted};white-space:nowrap;">${escapeHtml(label)}</td><td style="padding:6px 0;color:${COLORS.ink};font-weight:600;">${escapeHtml(value!)}</td></tr>`
    )
    .join("");
}

export function ownerNewTrialEmail(input: {
  email: string;
  name?: string | null;
  company?: string | null;
  isTestAccount: boolean;
  signedUpLabel: string;
  adminUrl: string;
}): { subject: string; html: string; text: string } {
  const who = input.name?.trim() || input.email;
  const subject = `${input.isTestAccount ? "[Test] " : ""}New trial signup: ${who}`;
  const html = shell({
    preheader: `${who} just started a free Event Scout trial.`,
    title: "New trial member",
    bodyHtml: `
      <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto;text-align:left;font-size:14px;">
        ${ownerAlertRows([
          ["Name", input.name?.trim()],
          ["Email", input.email],
          ["Company", input.company?.trim()],
          ["Signed up", input.signedUpLabel],
          ["Trial", "1 search + 2 contacts · 7 days"],
          ["Account", input.isTestAccount ? "Test account" : null],
        ])}
      </table>
    `,
    ctaLabel: "Open in Admin",
    ctaUrl: input.adminUrl,
    footerNote: "Owner alert from Event Scout.",
  });
  const text = [
    subject,
    "",
    input.name?.trim() ? `Name: ${input.name.trim()}` : "",
    `Email: ${input.email}`,
    input.company?.trim() ? `Company: ${input.company.trim()}` : "",
    `Signed up: ${input.signedUpLabel}`,
    "Trial: 1 search + 2 contacts, 7 days",
    "",
    `Open in Admin: ${input.adminUrl}`,
  ]
    .filter(Boolean)
    .join("\n");
  return { subject, html, text };
}

export function ownerNewPlanEmail(input: {
  email: string;
  name?: string | null;
  company?: string | null;
  isTestAccount: boolean;
  planName: string;
  billingLabel: string;
  amountLabel: string;
  adminUrl: string;
}): { subject: string; html: string; text: string } {
  const who = input.name?.trim() || input.email;
  const subject = `${input.isTestAccount ? "[Test] " : ""}New ${input.planName} customer: ${who} (${input.amountLabel})`;
  const html = shell({
    preheader: `${who} just subscribed to ${input.planName}.`,
    title: "New paying customer",
    bodyHtml: `
      <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto;text-align:left;font-size:14px;">
        ${ownerAlertRows([
          ["Name", input.name?.trim()],
          ["Email", input.email],
          ["Company", input.company?.trim()],
          ["Plan", `${input.planName} · ${input.billingLabel}`],
          ["Paid", input.amountLabel],
          ["Account", input.isTestAccount ? "Test account" : null],
        ])}
      </table>
    `,
    ctaLabel: "Open in Admin",
    ctaUrl: input.adminUrl,
    footerNote: "Owner alert from Event Scout.",
  });
  const text = [
    subject,
    "",
    input.name?.trim() ? `Name: ${input.name.trim()}` : "",
    `Email: ${input.email}`,
    input.company?.trim() ? `Company: ${input.company.trim()}` : "",
    `Plan: ${input.planName} (${input.billingLabel})`,
    `Paid: ${input.amountLabel}`,
    "",
    `Open in Admin: ${input.adminUrl}`,
  ]
    .filter(Boolean)
    .join("\n");
  return { subject, html, text };
}

export function confirmEmailEmail(input: {
  confirmUrl: string;
}): { subject: string; html: string; text: string } {
  const subject = "Confirm your Event Scout email";
  const html = shell({
    preheader: "One tap to open your Event Scout workspace.",
    title: "Confirm your email",
    bodyHtml: `
      <p style="margin:0;">Welcome in. Confirm this address to open your workspace and start your free search.</p>
    `,
    ctaLabel: "Confirm email",
    ctaUrl: input.confirmUrl,
  });
  const text = [
    "Confirm your Event Scout email",
    "",
    "Welcome in. Confirm this address to open your workspace:",
    input.confirmUrl,
    "",
    `Questions? ${emailReplyTo()}`,
  ].join("\n");
  return { subject, html, text };
}

export function resetPasswordEmail(input: {
  resetUrl: string;
}): { subject: string; html: string; text: string } {
  const subject = "Reset your Event Scout password";
  const html = shell({
    preheader: "Choose a new password for Event Scout.",
    title: "Reset your password",
    bodyHtml: `
      <p style="margin:0;">Use the button below to choose a new password. If you didn’t ask for this, you can ignore the message.</p>
    `,
    ctaLabel: "Choose new password",
    ctaUrl: input.resetUrl,
  });
  const text = [
    "Reset your Event Scout password",
    "",
    input.resetUrl,
    "",
    `Questions? ${emailReplyTo()}`,
  ].join("\n");
  return { subject, html, text };
}

export function trialCompleteEmail(input: {
  billingUrl: string;
}): { subject: string; html: string; text: string } {
  const subject = "Your free Event Scout search is complete";
  const html = shell({
    preheader: "Ready for more? Choose a plan and keep discovering.",
    title: "Your free search is done",
    bodyHtml: `
      <p style="margin:0 0 12px;">You’ve used your trial discovery search. Your results stay in your workspace.</p>
      <p style="margin:0;">Choose a plan when you’re ready for more searches, contact research, and scheduled runs.</p>
    `,
    ctaLabel: "View plans",
    ctaUrl: input.billingUrl,
  });
  const text = [
    "Your free Event Scout search is complete",
    "",
    "You've used your trial discovery search. Your results stay in your workspace.",
    `View plans: ${input.billingUrl}`,
    "",
    `Questions? ${emailReplyTo()}`,
  ].join("\n");
  return { subject, html, text };
}

export function trialEndingSoonEmail(input: {
  searchUrl: string;
  endsOnLabel: string;
}): { subject: string; html: string; text: string } {
  const subject = "Your free Event Scout trial ends in 2 days";
  const html = shell({
    preheader: `Your free search and contact lookups are available until ${input.endsOnLabel}.`,
    title: "Your free search is waiting",
    bodyHtml: `
      <p style="margin:0 0 12px;">Your free trial ends on <strong style="color:${COLORS.ink};">${escapeHtml(input.endsOnLabel)}</strong>.</p>
      <p style="margin:0;">You still have one discovery search and two organizer contact lookups to use. It takes a couple of minutes.</p>
    `,
    ctaLabel: "Run my free search",
    ctaUrl: input.searchUrl,
  });
  const text = [
    subject,
    "",
    `Your free trial ends on ${input.endsOnLabel}.`,
    "You still have one discovery search and two organizer contact lookups to use.",
    `Run my free search: ${input.searchUrl}`,
    "",
    `Questions? ${emailReplyTo()}`,
  ].join("\n");
  return { subject, html, text };
}

export function trialExpiredEmail(input: {
  billingUrl: string;
}): { subject: string; html: string; text: string } {
  const subject = "Your free Event Scout trial has ended";
  const html = shell({
    preheader: "Choose a plan to start discovering speaking and event opportunities.",
    title: "Your free trial has ended",
    bodyHtml: `
      <p style="margin:0 0 12px;">Your 7-day free trial is over. Your workspace and anything you saved stay available.</p>
      <p style="margin:0;">Choose a plan when you’re ready for discovery searches, contact research, and scheduled runs.</p>
    `,
    ctaLabel: "View plans",
    ctaUrl: input.billingUrl,
  });
  const text = [
    subject,
    "",
    "Your 7-day free trial is over. Your workspace and anything you saved stay available.",
    `View plans: ${input.billingUrl}`,
    "",
    `Questions? ${emailReplyTo()}`,
  ].join("\n");
  return { subject, html, text };
}

export function paymentConfirmedEmail(input: {
  planName: string;
  amountLabel: string;
  invoiceNumber?: string | null;
  invoiceUrl: string;
  billingUrl: string;
}): { subject: string; html: string; text: string } {
  const subject = `Payment confirmed — ${input.planName}`;
  const invoiceLine = input.invoiceNumber
    ? `<p style="margin:12px 0 0;">Invoice <strong style="color:${COLORS.ink};">${escapeHtml(input.invoiceNumber)}</strong> · ${escapeHtml(input.amountLabel)}</p>`
    : `<p style="margin:12px 0 0;">${escapeHtml(input.amountLabel)}</p>`;
  const html = shell({
    preheader: `Payment received for ${input.planName}. Your credits are ready.`,
    title: "Payment confirmed",
    bodyHtml: `
      <p style="margin:0;">Thanks — your <strong style="color:${COLORS.ink};">${escapeHtml(input.planName)}</strong> payment went through and your credits are available.</p>
      ${invoiceLine}
      <p style="margin:12px 0 0;">A PDF copy is attached when available.</p>
    `,
    ctaLabel: "View invoice",
    ctaUrl: input.invoiceUrl || input.billingUrl,
  });
  const text = [
    "Payment confirmed",
    "",
    `Your ${input.planName} payment went through (${input.amountLabel}).`,
    input.invoiceNumber ? `Invoice ${input.invoiceNumber}` : "",
    input.invoiceUrl || input.billingUrl,
    "",
    `Questions? ${emailReplyTo()}`,
  ]
    .filter(Boolean)
    .join("\n");
  return { subject, html, text };
}

export function creditsToppedUpEmail(input: {
  packName: string;
  credits: number;
  amountLabel?: string;
  billingUrl: string;
}): { subject: string; html: string; text: string } {
  const subject = `${input.credits.toLocaleString("en-US")} credits added`;
  const html = shell({
    preheader: `${input.packName} is in your workspace.`,
    title: "Credits topped up",
    bodyHtml: `
      <p style="margin:0 0 12px;"><strong style="color:${COLORS.ink};">${input.credits.toLocaleString("en-US")} credits</strong> from your ${escapeHtml(input.packName)} are ready to use.</p>
      ${input.amountLabel ? `<p style="margin:0;">Charged ${escapeHtml(input.amountLabel)}.</p>` : ""}
    `,
    ctaLabel: "Open billing",
    ctaUrl: input.billingUrl,
  });
  const text = [
    "Credits topped up",
    "",
    `${input.credits.toLocaleString("en-US")} credits from your ${input.packName} are ready.`,
    input.amountLabel ? `Charged ${input.amountLabel}.` : "",
    input.billingUrl,
    "",
    `Questions? ${emailReplyTo()}`,
  ]
    .filter(Boolean)
    .join("\n");
  return { subject, html, text };
}

/** Paste into Supabase Auth → Email Templates (Confirm signup). */
export function supabaseConfirmSignupTemplateHtml(): string {
  return shell({
    preheader: "Confirm your email to activate Event Scout.",
    title: "Confirm your email",
    bodyHtml: `<p style="margin:0;">Welcome in. Confirm this address to open your workspace and start your free search.</p>`,
    ctaLabel: "Confirm email",
    ctaUrl: "{{ .ConfirmationURL }}",
    logoSrc: "{{ .SiteURL }}/brand/icon-mark-square.png",
  });
}

/** Paste into Supabase Auth → Email Templates (Reset password). */
export function supabaseResetPasswordTemplateHtml(): string {
  return shell({
    preheader: "Reset your Event Scout password.",
    title: "Reset your password",
    bodyHtml: `<p style="margin:0;">Use the button below to choose a new password. If you didn’t ask for this, you can ignore the message.</p>`,
    ctaLabel: "Choose new password",
    ctaUrl: "{{ .ConfirmationURL }}",
    logoSrc: "{{ .SiteURL }}/brand/icon-mark-square.png",
  });
}
