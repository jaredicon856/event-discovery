"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabaseBrowser";
import { GOOGLE_OUTBOUND_STEPS, SignInTransition } from "@/components/SignInTransition";

function pause(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function SignupForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState<"email" | "google" | null>(null);
  const [signInStep, setSignInStep] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  function callbackUrl() {
    const callback = new URL("/auth/callback", window.location.origin);
    callback.searchParams.set("next", "/onboarding");
    return callback.toString();
  }

  async function signupWithGoogle() {
    setLoading("google");
    setSignInStep(0);
    setError(null);
    await pause(420);
    setSignInStep(1);
    await pause(360);
    const { error: oauthError } = await getSupabaseBrowserClient().auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: callbackUrl(),
        queryParams: { prompt: "select_account" },
      },
    });
    if (oauthError) {
      setError(
        oauthError.message.toLowerCase().includes("provider")
          ? "Google sign-up is not enabled for Event Scout yet. Please create your account with email while the owner completes setup."
          : oauthError.message
      );
      setLoading(null);
      setSignInStep(null);
    }
  }

  async function signupWithEmail(event: React.FormEvent) {
    event.preventDefault();
    setLoading("email");
    setError(null);
    setMessage(null);

    if (password.length < 8) {
      setError("Use at least 8 characters for your password.");
      setLoading(null);
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      setLoading(null);
      return;
    }

    const { data, error: signupError } = await getSupabaseBrowserClient().auth.signUp({
      email,
      password,
      options: { emailRedirectTo: callbackUrl() },
    });
    if (signupError) {
      setError(signupError.message);
      setLoading(null);
      return;
    }
    if (data.session) {
      const activation = await fetch("/api/auth/activate", { method: "POST" });
      if (!activation.ok) {
        const json = await activation.json();
        setError(json.error ?? "Account activation failed");
        setLoading(null);
        return;
      }
      await fetch("/api/auth/password-enabled", { method: "POST" });
      router.replace("/onboarding");
      router.refresh();
      return;
    }

    // Supabase's built-in mailer is unreliable here — deliver confirmation via Resend.
    await fetch("/api/auth/send-verification", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });

    setMessage(
      "Check your inbox to verify your email (and spam if needed). Your private workspace and free trial will be ready when you return."
    );
    setLoading(null);
  }

  return (
    <main className="min-h-screen bg-[#061b1c] text-white min-[900px]:grid min-[900px]:grid-cols-[1.04fr_.96fr]">
      {signInStep !== null && (
        <SignInTransition steps={GOOGLE_OUTBOUND_STEPS} activeStep={signInStep} />
      )}
      <section className="border-b border-white/10 px-6 py-6 min-[900px]:flex min-[900px]:min-h-screen min-[900px]:flex-col min-[900px]:border-b-0 min-[900px]:border-r min-[900px]:px-12 min-[900px]:py-10 lg:px-16 lg:py-12">
        <Image src="/brand/icon-logo.webp" alt="Project ICON" width={124} height={44} priority />
        <div className="mt-6 max-w-2xl min-[900px]:my-auto">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[#c59a48]">Event Scout</p>
          <h1 className="mt-3 text-3xl font-semibold leading-tight sm:text-4xl lg:text-6xl">Your next opportunity starts here.</h1>
          <p className="mt-4 max-w-xl text-sm leading-6 text-white/65 sm:text-base lg:text-lg lg:leading-8">
            Build a private pipeline of relevant stages, organizer contacts, and outreach-ready opportunities.
          </p>
          <div className="mt-8 hidden max-w-xl rounded-2xl border border-[#c59a48]/25 bg-white/[0.04] p-6 lg:block">
            <p className="text-sm font-semibold text-[#e5c98e]">Try one search free</p>
            <p className="mt-2 text-2xl font-semibold">Including two contact lookups.</p>
            <p className="mt-3 text-sm text-white/60">No card required. Your results remain in your workspace after the trial.</p>
          </div>
        </div>
      </section>

      <section className="flex items-center justify-center bg-[#fbfaf7] px-6 py-9 text-[#171813] sm:px-10 lg:px-16">
        <div className="w-full max-w-md">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#9a722d]">Create your workspace</p>
          <h2 className="mt-3 text-3xl font-semibold tracking-[-0.02em]">Start your free search</h2>
          <p className="mt-2 text-sm leading-6 text-[#62645f]">One discovery search and contact research for up to two returned events.</p>

          <button
            type="button"
            onClick={signupWithGoogle}
            disabled={loading !== null}
            className="mt-7 flex min-h-12 w-full cursor-pointer items-center justify-center gap-3 rounded-lg border border-[#b0863c]/40 bg-white px-4 text-sm font-semibold shadow-[0_0_0_1px_rgba(176,134,60,0.08)] transition-colors duration-200 hover:border-[#b0863c] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#b0863c] disabled:cursor-wait disabled:opacity-60"
          >
            <span aria-hidden className="text-lg font-bold">G</span>
            {loading === "google" ? "Connecting…" : "Continue with Google"}
          </button>
          <div className="my-5 flex items-center gap-3"><span className="h-px flex-1 bg-[#dfddd5]" /><span className="text-xs text-[#71736d]">or create with email</span><span className="h-px flex-1 bg-[#dfddd5]" /></div>

          <form onSubmit={signupWithEmail} className="space-y-4">
            <label className="block text-sm font-medium">Email
              <input type="email" required autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} className="mt-1.5 min-h-11 w-full rounded-lg border border-[#d9d7cf] bg-white px-3.5 text-base outline-none transition-colors focus:border-[#b0863c] focus:ring-2 focus:ring-[#b0863c]/20" />
            </label>
            <label className="block text-sm font-medium">Password
              <span className="relative mt-1.5 block">
                <input type={showPassword ? "text" : "password"} required minLength={8} autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} className="min-h-11 w-full rounded-lg border border-[#d9d7cf] bg-white px-3.5 pr-16 text-base outline-none transition-colors focus:border-[#b0863c] focus:ring-2 focus:ring-[#b0863c]/20" />
                <button type="button" onClick={() => setShowPassword((value) => !value)} className="absolute inset-y-0 right-0 min-w-14 cursor-pointer px-3 text-xs font-medium text-[#686a65] focus-visible:outline-2 focus-visible:outline-[#b0863c]">{showPassword ? "Hide" : "Show"}</button>
              </span>
              <span className="mt-1 block text-xs text-[#71736d]">Use at least 8 characters.</span>
            </label>
            <label className="block text-sm font-medium">Confirm password
              <input
                type={showPassword ? "text" : "password"}
                required
                minLength={8}
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                className="mt-1.5 min-h-11 w-full rounded-lg border border-[#d9d7cf] bg-white px-3.5 text-base outline-none transition-colors focus:border-[#b0863c] focus:ring-2 focus:ring-[#b0863c]/20"
              />
            </label>
            {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>}
            {message && <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm leading-6 text-emerald-900">{message}</p>}
            <button disabled={loading !== null} className="min-h-11 w-full cursor-pointer rounded-lg bg-[#b0863c] px-4 text-sm font-semibold text-white transition-colors duration-200 hover:bg-[#96712f] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#b0863c] disabled:cursor-wait disabled:opacity-60">
              {loading === "email" ? "Creating workspace…" : "Create free workspace"}
            </button>
          </form>
          <p className="mt-6 text-center text-sm text-[#62645f]">Already have an account? <Link href="/login" className="font-semibold text-[#8d6728] hover:underline">Sign in</Link></p>
          <p className="mt-3 text-center text-xs leading-5 text-[#777972]">No card required. No automatic charges.</p>
        </div>
      </section>
    </main>
  );
}
