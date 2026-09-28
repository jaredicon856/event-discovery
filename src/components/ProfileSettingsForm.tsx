"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ProfileAvatar } from "@/components/ProfileAvatar";
import { ACCOUNT_TIMEZONE, ACCOUNT_TIMEZONE_LABEL } from "@/lib/timezone";

type ProfileValues = {
  fullName: string;
  displayName: string;
  company: string;
  jobTitle: string;
  timezone: string;
};

export function ProfileSettingsForm({
  email,
  emailVerified,
  initial,
  initialAvatarUrl,
}: {
  email: string;
  emailVerified: boolean;
  initial: ProfileValues;
  initialAvatarUrl: string | null;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [values, setValues] = useState(initial);
  const [avatarUrl, setAvatarUrl] = useState(initialAvatarUrl);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [notice, setNotice] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const avatarName = values.displayName || values.fullName || email;

  function setField(field: keyof ProfileValues, value: string) {
    setValues((current) => ({ ...current, [field]: value }));
  }

  async function uploadPhoto(file: File) {
    setNotice(null);
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 2 * 1024 * 1024) {
      setNotice({ type: "error", text: "Choose a JPEG, PNG, or WebP image smaller than 2 MB." });
      return;
    }
    const preview = URL.createObjectURL(file);
    setPreviewUrl(preview);
    setPhotoBusy(true);
    const form = new FormData();
    form.set("photo", file);
    const response = await fetch("/api/profile/avatar", { method: "POST", body: form });
    const json = await response.json();
    if (!response.ok) {
      setNotice({ type: "error", text: json.error ?? "Photo upload failed." });
      setPreviewUrl(null);
    } else {
      setAvatarUrl(`${json.avatarUrl}${json.avatarUrl?.includes("?") ? "&" : "?"}v=${Date.now()}`);
      setPreviewUrl(null);
      setNotice({ type: "success", text: "Profile photo updated." });
      router.refresh();
    }
    URL.revokeObjectURL(preview);
    setPhotoBusy(false);
  }

  async function removePhoto() {
    setPhotoBusy(true);
    setNotice(null);
    const response = await fetch("/api/profile/avatar", { method: "DELETE" });
    const json = await response.json();
    if (!response.ok) setNotice({ type: "error", text: json.error ?? "Could not remove photo." });
    else {
      setAvatarUrl(null);
      setPreviewUrl(null);
      setNotice({ type: "success", text: "Profile photo removed." });
      router.refresh();
    }
    setPhotoBusy(false);
  }

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setNotice(null);
    const response = await fetch("/api/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...values, timezone: ACCOUNT_TIMEZONE }),
    });
    const json = await response.json();
    if (!response.ok) setNotice({ type: "error", text: json.error ?? "Profile could not be saved." });
    else {
      setNotice({ type: "success", text: "Profile saved." });
      router.refresh();
    }
    setSaving(false);
  }

  return (
    <form onSubmit={save} className="space-y-6">
      <section className="rounded-2xl border border-icon-border bg-icon-surface p-5 shadow-sm sm:p-6">
        <div className="flex flex-wrap items-center gap-5">
          <ProfileAvatar src={previewUrl || avatarUrl} name={avatarName} sizeClass="h-20 w-20 text-xl" />
          <div className="flex-1">
            <h2 className="font-semibold">Profile photo</h2>
            <p className="mt-1 text-sm text-icon-text-light">JPEG, PNG, or WebP. Maximum 2 MB and 4096 × 4096.</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <input
                ref={inputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="sr-only"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) void uploadPhoto(file);
                  event.currentTarget.value = "";
                }}
              />
              <button type="button" disabled={photoBusy} onClick={() => inputRef.current?.click()} className="rounded-lg border border-icon-border px-3 py-2 text-sm font-semibold hover:border-icon-primary disabled:opacity-50">
                {photoBusy ? "Updating…" : avatarUrl ? "Replace photo" : "Upload photo"}
              </button>
              {avatarUrl && <button type="button" disabled={photoBusy} onClick={removePhoto} className="rounded-lg px-3 py-2 text-sm font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50">Remove</button>}
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-icon-border bg-icon-surface p-5 shadow-sm sm:p-6">
        <h2 className="text-lg font-semibold">Personal details</h2>
        <p className="mt-1 text-sm text-icon-text-light">Used for greetings and activity throughout your private workspace.</p>
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          {[
            ["Full name", "fullName", "Your full name"],
            ["Preferred display name", "displayName", "How we should greet you"],
            ["Company", "company", "Optional"],
            ["Job title", "jobTitle", "Optional"],
          ].map(([label, field, placeholder]) => (
            <label key={field} className="text-sm font-medium">
              {label}
              <input value={values[field as keyof ProfileValues]} onChange={(event) => setField(field as keyof ProfileValues, event.target.value)} maxLength={field === "displayName" ? 80 : 120} placeholder={placeholder} className="mt-1.5 min-h-11 w-full rounded-lg border border-icon-border bg-icon-background px-3.5 text-base outline-none focus:border-icon-primary focus:ring-2 focus:ring-icon-primary/20" />
            </label>
          ))}
          <div className="sm:col-span-2">
            <p className="text-sm font-medium">Timezone</p>
            <div className="mt-1.5 flex min-h-11 items-center rounded-lg border border-icon-border bg-icon-background px-3.5 text-sm">
              {ACCOUNT_TIMEZONE_LABEL}
            </div>
            <p className="mt-1.5 text-xs text-icon-text-light">Dates and times in your workspace always use US Eastern Time.</p>
          </div>
          <div className="sm:col-span-2">
            <p className="text-sm font-medium">Email address</p>
            <div className="mt-1.5 flex min-h-11 items-center justify-between rounded-lg border border-icon-border bg-icon-background px-3.5 text-sm">
              <span>{email}</span>
              <span className={emailVerified ? "text-emerald-700" : "text-amber-700"}>{emailVerified ? "Verified" : "Verification pending"}</span>
            </div>
            <p className="mt-1.5 text-xs text-icon-text-light">Email changes are not available in this release.</p>
          </div>
        </div>
      </section>

      {notice && <p role="status" className={`rounded-lg border px-4 py-3 text-sm ${notice.type === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-red-200 bg-red-50 text-red-800"}`}>{notice.text}</p>}
      <div className="flex justify-end">
        <button disabled={saving} className="min-h-11 rounded-lg bg-icon-primary px-5 text-sm font-semibold text-white disabled:opacity-60">{saving ? "Saving…" : "Save profile"}</button>
      </div>
    </form>
  );
}
