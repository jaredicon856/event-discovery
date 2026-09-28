"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { getSupabaseBrowserClient } from "@/lib/supabaseBrowser";
import {
  EMAIL_SIGN_IN_STEPS,
  GOOGLE_OUTBOUND_STEPS,
  SignInTransition,
} from "@/components/SignInTransition";

// Sign-in is usually a second of network round trips. Holding each step briefly
// keeps the transition readable instead of flickering through three labels.
async function withMinimumDuration<T>(work: Promise<T>, ms: number): Promise<T> {
  const [result] = await Promise.all([work, new Promise((resolve) => setTimeout(resolve, ms))]);
  return result;
}

function pause(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const BENEFITS = [
  "Discover relevant speaking opportunities",
  "Research organizer contacts",
  "Save and export the right opportunities",
];

function messageForQuery(searchParams: URLSearchParams): string | null {
  const error = searchParams.get("error");
  const access = searchParams.get("access");
  if (error === "invalid_invitation") return "That invitation is invalid, expired, revoked, used, or belongs to another email.";
  if (error === "invitation_required" || error === "verification_required" || access === "pending") return "Verify your email or identity before continuing.";
  if (access === "suspended") return "This account is suspended. Contact the Event Scout owner.";
  if (error === "auth_callback") return "Sign-in could not be completed. Please try again.";
  return null;
}

export function AuthForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState<"email" | "google" | null>(null);
  const [signInStep, setSignInStep] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(() => messageForQuery(searchParams));
  const invite = searchParams.get("invite");
  const next = searchParams.get("next") || "/";
  const acceptHash = searchParams.get("accept_hash") === "1";
  const activateHash = searchParams.get("activate_hash") === "1";
  const sessionHash = searchParams.get("session_hash") === "1";

  async function verifyAccess() {
    if (invite) {
      const accept = await fetch("/api/auth/accept-invitation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: invite }),
      });
      if (!accept.ok) {
        const json = await accept.json();
        throw new Error(json.error ?? "Invitation could not be accepted");
      }
    }
    const activation = await fetch("/api/auth/activate", { method: "POST" });
    if (!activation.ok) {
      const json = await activation.json();
      throw new Error(json.error ?? "Account activation failed");
    }
    const response = await fetch("/api/auth/access");
    if (!response.ok) {
      const json = await response.json();
      throw new Error(json.error ?? "Account access is not active");
    }
  }

  useEffect(() => {
    if ((!acceptHash && !activateHash && !sessionHash) || (acceptHash && !invite) || !window.location.hash) return;
    const fragment = new URLSearchParams(window.location.hash.slice(1));
    const accessToken = fragment.get("access_token");
    const refreshToken = fragment.get("refresh_token");
    if (!accessToken || !refreshToken) return;

    let cancelled = false;
    async function acceptImplicitInvitation() {
      setLoading("email");
      setSignInStep(1);
      setError(null);
      const supabase = getSupabaseBrowserClient();
      const { error: sessionError } = await supabase.auth.setSession({
        access_token: accessToken!,
        refresh_token: refreshToken!,
      });
      if (sessionError) throw sessionError;
      const response = acceptHash
        ? await fetch("/api/auth/accept-invitation", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ token: invite }),
          })
        : await fetch("/api/auth/activate", { method: "POST" });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error ?? "Account could not be activated");
      if (!cancelled) {
        setSignInStep(2);
        router.replace(next);
        router.refresh();
      }
    }
    acceptImplicitInvitation().catch(async (implicitError) => {
      await getSupabaseBrowserClient().auth.signOut();
      if (!cancelled) {
        setError(implicitError instanceof Error ? implicitError.message : "Invitation could not be accepted");
        setLoading(null);
        setSignInStep(null);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [acceptHash, activateHash, sessionHash, invite, next, router]);

  async function handleEmailSubmit(event: React.FormEvent) {
    event.preventDefault();
    setLoading("email");
    setSignInStep(0);
    setError(null);
    const supabase = getSupabaseBrowserClient();
    const { error: signInError } = await withMinimumDuration(
      supabase.auth.signInWithPassword({ email, password }),
      420
    );
    if (signInError) {
      setError(signInError.message);
      setLoading(null);
      setSignInStep(null);
      return;
    }
    try {
      setSignInStep(1);
      await withMinimumDuration(verifyAccess(), 420);
      setSignInStep(2);
      router.push(next);
      router.refresh();
    } catch (accessError) {
      await supabase.auth.signOut();
      setError(accessError instanceof Error ? accessError.message : "Access denied");
      setLoading(null);
      setSignInStep(null);
    }
  }

  async function handleGoogle() {
    setLoading("google");
    setSignInStep(0);
    setError(null);
    await pause(420);
    setSignInStep(1);
    await pause(360);

    const callback = new URL("/auth/callback", window.location.origin);
    callback.searchParams.set("next", next);
    if (invite) callback.searchParams.set("invite", invite);
    const { error: oauthError } = await getSupabaseBrowserClient().auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: callback.toString(),
        queryParams: { prompt: "select_account" },
      },
    });
    if (oauthError) {
      setError(
        oauthError.message.toLowerCase().includes("provider")
          ? "Google sign-in is not enabled for Event Scout yet. Please use email sign-in while the owner completes setup."
          : oauthError.message
      );
      setLoading(null);
      setSignInStep(null);
    }
  }

  const transitionSteps = loading === "google" ? GOOGLE_OUTBOUND_STEPS : EMAIL_SIGN_IN_STEPS;

  return (
    <main className="min-h-screen bg-icon-background text-icon-text min-[900px]:grid min-[900px]:grid-cols-[11fr_9fr]">
      {signInStep !== null && (
        <SignInTransition steps={transitionSteps} activeStep={signInStep} />
      )}
      <section className="relative overflow-hidden border-b border-icon-border px-6 py-6 min-[900px]:min-h-screen min-[900px]:border-b-0 min-[900px]:border-r min-[900px]:px-10 min-[900px]:py-10 lg:px-14 lg:py-12">
        <div aria-hidden className="absolute -left-24 top-40 h-72 w-72 rounded-full border border-icon-primary/15" />
        <div aria-hidden className="absolute -left-8 top-56 h-44 w-44 rounded-full border border-icon-primary/10" />
        <div className="relative mx-auto flex h-full max-w-2xl flex-col">
          <Image src="/brand/icon-logo.webp" alt="Project ICON" width={124} height={44} priority />
          <div className="mt-6 lg:mt-auto">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-icon-primary">Event Scout</p>
            <h1 className="mt-3 max-w-xl text-3xl font-semibold leading-tight sm:text-4xl lg:mt-4 lg:text-6xl">
              Find your next stage.
            </h1>
            <p className="mt-3 max-w-xl text-sm leading-6 text-icon-text-light sm:text-base lg:mt-5 lg:text-lg lg:leading-7">
              Discover speaking opportunities, research organizer contacts, and keep your outreach organized.
            </p>
            <ul className="mt-8 hidden gap-3 text-sm lg:grid">
              {BENEFITS.map((benefit) => (
                <li key={benefit} className="flex items-center gap-3">
                  <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-icon-primary" />
                  <span>{benefit}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="relative mt-10 hidden max-w-xl rounded-xl border border-icon-border bg-icon-surface/80 p-5 lg:mb-auto lg:block">
            <div className="flex items-center justify-between gap-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-icon-text-light">Illustrative opportunity</p>
              <span className="rounded-full bg-emerald-950 px-2.5 py-1 text-xs font-semibold text-emerald-300">Submissions open</span>
            </div>
            <p className="mt-5 text-lg font-semibold">Leadership Innovation Summit 2027</p>
            <p className="mt-1 text-sm text-icon-text-light">Austin, Texas · October 12–14</p>
            <div className="mt-4 flex items-center justify-between border-t border-icon-border pt-4 text-sm">
              <span className="text-icon-text-light">Organizer contact</span>
              <span className="font-medium text-icon-primary">Available to research</span>
            </div>
          </div>
        </div>
      </section>

      <section className="flex items-center justify-center px-6 py-10 sm:px-10 lg:px-16">
        <div className="w-full max-w-md">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-icon-primary">Project ICON</p>
          <h2 className="mt-3 text-3xl font-semibold">Welcome to Event Scout</h2>
          <p className="mt-2 text-sm text-icon-text-light">Sign in to discover your next opportunity.</p>

          <button
            type="button"
            onClick={handleGoogle}
            disabled={loading !== null}
            className="mt-8 flex min-h-12 w-full cursor-pointer items-center justify-center gap-3 rounded-lg border border-icon-primary/35 bg-icon-surface px-4 py-3 text-sm font-semibold shadow-[0_0_0_1px_rgba(184,137,50,0.08)] transition-colors hover:border-icon-primary hover:bg-icon-surface/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-icon-primary disabled:cursor-wait disabled:opacity-60"
          >
            <svg aria-hidden viewBox="0 0 24 24" className="h-5 w-5">
              <path fill="currentColor" d="M21.6 12.23c0-.71-.06-1.4-.18-2.06H12v3.9h5.38a4.6 4.6 0 0 1-2 3.02v2.53h3.24c1.9-1.75 2.98-4.33 2.98-7.39Z" />
              <path fill="currentColor" opacity=".8" d="M12 22c2.7 0 4.98-.9 6.63-2.38l-3.24-2.53c-.9.6-2.05.96-3.39.96-2.61 0-4.82-1.76-5.61-4.13H3.04v2.61A10 10 0 0 0 12 22Z" />
              <path fill="currentColor" opacity=".6" d="M6.39 13.92A6.02 6.02 0 0 1 6.07 12c0-.67.12-1.32.32-1.92V7.47H3.04A10 10 0 0 0 2 12c0 1.61.39 3.14 1.04 4.53l3.35-2.61Z" />
              <path fill="currentColor" opacity=".9" d="M12 5.95c1.47 0 2.79.51 3.82 1.5l2.88-2.88A9.64 9.64 0 0 0 12 2a10 10 0 0 0-8.96 5.47l3.35 2.61C7.18 7.71 9.39 5.95 12 5.95Z" />
            </svg>
            {loading === "google" ? "Connecting…" : "Continue with Google"}
          </button>

          <div className="my-6 flex items-center gap-3">
            <div className="h-px flex-1 bg-icon-border" />
            <span className="text-xs text-icon-text-light">or sign in with email</span>
            <div className="h-px flex-1 bg-icon-border" />
          </div>

          <form onSubmit={handleEmailSubmit} className="space-y-4">
            <label className="block">
              <span className="text-sm font-medium">Email</span>
              <input
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="mt-1.5 min-h-11 w-full rounded-lg border border-icon-border bg-icon-surface px-3.5 text-base outline-none transition-colors focus:border-icon-primary focus:ring-2 focus:ring-icon-primary/30"
              />
            </label>
            <label className="block">
              <span className="flex items-center justify-between text-sm font-medium">
                Password
                <Link href="/forgot-password" className="text-xs text-icon-primary hover:underline">Forgot password?</Link>
              </span>
              <span className="relative mt-1.5 block">
                <input
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  className="min-h-11 w-full rounded-lg border border-icon-border bg-icon-surface px-3.5 pr-16 text-base outline-none transition-colors focus:border-icon-primary focus:ring-2 focus:ring-icon-primary/30"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((value) => !value)}
                  className="absolute inset-y-0 right-0 min-w-14 cursor-pointer px-3 text-xs font-medium text-icon-text-light hover:text-icon-text focus-visible:outline-2 focus-visible:outline-icon-primary"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? "Hide" : "Show"}
                </button>
              </span>
            </label>

            {error && (
              <p role="alert" className="rounded-lg border border-red-900 bg-red-950/40 px-3 py-2 text-sm text-red-200">{error}</p>
            )}

            <button
              type="submit"
              disabled={loading !== null}
              className="min-h-11 w-full cursor-pointer rounded-lg bg-icon-primary px-4 py-2.5 text-sm font-semibold text-icon-background transition-[filter] hover:brightness-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-icon-primary disabled:cursor-wait disabled:opacity-60"
            >
              {loading === "email" ? "Signing in…" : "Sign in"}
            </button>
          </form>

          <p className="mt-6 text-center text-sm text-icon-text-light">
            Invited? Sign in with the email that received your invitation.
          </p>
          <p className="mt-3 text-center text-sm">
            New to Event Scout? <Link href="/signup" className="font-medium text-icon-primary hover:underline">Try one search free</Link>
          </p>
        </div>
      </section>
    </main>
  );
}
