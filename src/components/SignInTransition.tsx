"use client";

import Image from "next/image";

// Each label maps to a step the sign-in flow actually awaits, so the progress
// rail reflects real work rather than a decorative timer.
export const EMAIL_SIGN_IN_STEPS = [
  "Verifying your credentials",
  "Confirming account access",
  "Preparing your workspace",
] as const;

export const GOOGLE_OUTBOUND_STEPS = [
  "Connecting with Google",
  "Opening secure sign-in",
] as const;

/** @deprecated Use GOOGLE_OUTBOUND_STEPS — kept so a hot-reload never blanks /login. */
export const GOOGLE_SIGN_IN_STEPS = GOOGLE_OUTBOUND_STEPS;

export const GOOGLE_RETURN_STEPS = [
  "Confirming your Google account",
  "Preparing your workspace",
] as const;

export function SignInTransition({
  steps,
  activeStep,
}: {
  steps: readonly string[];
  activeStep: number;
}) {
  const label = steps[Math.min(activeStep, steps.length - 1)];
  const progress = ((Math.min(activeStep, steps.length - 1) + 1) / steps.length) * 100;

  return (
    <div
      role="status"
      aria-live="polite"
      className="auth-veil fixed inset-0 z-50 flex flex-col items-center justify-center gap-8 bg-icon-background/95 px-6 backdrop-blur-sm"
    >
      <div className="auth-mark relative flex items-center justify-center">
        <span aria-hidden className="auth-halo absolute h-24 w-24 rounded-full border border-icon-primary/25" />
        <Image
          src="/brand/icon-logo.webp"
          alt=""
          width={124}
          height={44}
          priority
          className="relative h-10 w-auto object-contain"
        />
      </div>

      <div className="w-full max-w-[17rem]">
        <div className="h-[3px] w-full overflow-hidden rounded-full bg-icon-border">
          <span
            className="block h-full rounded-full bg-icon-primary transition-[width] duration-500 ease-out"
            style={{ width: `${progress}%` }}
          />
        </div>
        {/* Keyed so the label replays its entrance on every step change. */}
        <p key={label} className="auth-step mt-4 text-center text-sm text-icon-text-light">
          {label}
        </p>
      </div>
    </div>
  );
}
