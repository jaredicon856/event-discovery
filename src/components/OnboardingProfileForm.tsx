"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function OnboardingProfileForm({
  email,
  initialFirstName,
  initialLastName,
  initialCompany,
  initialJobTitle,
}: {
  email: string;
  initialFirstName: string;
  initialLastName: string;
  initialCompany: string;
  initialJobTitle: string;
}) {
  const router = useRouter();
  const [firstName, setFirstName] = useState(initialFirstName);
  const [lastName, setLastName] = useState(initialLastName);
  const [company, setCompany] = useState(initialCompany);
  const [jobTitle, setJobTitle] = useState(initialJobTitle);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    const response = await fetch("/api/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        completeProfile: true,
        firstName,
        lastName,
        company,
        jobTitle,
        displayName: firstName.trim(),
      }),
    });
    const json = await response.json();
    if (!response.ok) {
      setError(json.error ?? "Your profile could not be saved.");
      setSaving(false);
      return;
    }
    router.replace("/onboarding");
    router.refresh();
  }

  const inputClass =
    "mt-1.5 min-h-11 w-full rounded-lg border border-white/15 bg-black/20 px-3.5 text-base text-white outline-none transition-colors placeholder:text-white/35 focus:border-[#c59a48] focus:ring-2 focus:ring-[#c59a48]/20";

  return (
    <form onSubmit={save} className="mt-8 space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="text-sm font-medium">
          First name
          <input
            value={firstName}
            onChange={(event) => setFirstName(event.target.value)}
            required
            maxLength={60}
            autoComplete="given-name"
            className={inputClass}
          />
        </label>
        <label className="text-sm font-medium">
          Last name
          <input
            value={lastName}
            onChange={(event) => setLastName(event.target.value)}
            required
            maxLength={60}
            autoComplete="family-name"
            className={inputClass}
          />
        </label>
        <label className="text-sm font-medium">
          Company <span className="font-normal text-white/45">(optional)</span>
          <input
            value={company}
            onChange={(event) => setCompany(event.target.value)}
            maxLength={120}
            autoComplete="organization"
            className={inputClass}
          />
        </label>
        <label className="text-sm font-medium">
          Job title <span className="font-normal text-white/45">(optional)</span>
          <input
            value={jobTitle}
            onChange={(event) => setJobTitle(event.target.value)}
            maxLength={120}
            autoComplete="organization-title"
            className={inputClass}
          />
        </label>
      </div>
      <p className="text-xs leading-5 text-white/45">Signed in as {email}. Dates in this workspace use US Eastern Time.</p>
      {error && <p role="alert" className="rounded-lg border border-red-300/40 bg-red-950/40 px-3 py-2 text-sm text-red-100">{error}</p>}
      <button
        disabled={saving}
        className="min-h-11 w-full rounded-lg bg-[#b0863c] px-5 text-sm font-semibold text-white transition-colors hover:bg-[#96712f] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#c59a48] disabled:opacity-60 sm:w-auto"
      >
        {saving ? "Saving…" : "Save and continue"}
      </button>
    </form>
  );
}
