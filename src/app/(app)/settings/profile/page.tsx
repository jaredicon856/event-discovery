import Link from "next/link";
import { requireActiveUser } from "@/lib/access";
import { ProfileSettingsForm } from "@/components/ProfileSettingsForm";
import { ACCOUNT_TIMEZONE } from "@/lib/timezone";

export const dynamic = "force-dynamic";

export default async function ProfileSettingsPage() {
  const { user, profile, service } = await requireActiveUser();
  const { data: avatar } = profile.avatar_path
    ? await service.storage.from("profile-photos").createSignedUrl(profile.avatar_path, 60 * 60)
    : { data: null };

  return (
    <div className="min-h-screen px-5 py-7 sm:px-8 lg:px-10">
      <div className="mx-auto max-w-3xl">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-icon-primary">Profile &amp; settings</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight">My profile</h1>
            <p className="mt-2 text-sm text-icon-text-light">Personalize how you appear in Event Scout.</p>
          </div>
          <Link href="/settings/security" className="rounded-lg border border-icon-border px-4 py-2.5 text-sm font-semibold hover:border-icon-primary">
            Account &amp; Security
          </Link>
        </header>
        <div className="mt-7">
          <ProfileSettingsForm
            email={profile.email}
            emailVerified={Boolean(user.email_confirmed_at)}
            initial={{
              fullName: profile.full_name ?? "",
              displayName: profile.display_name ?? "",
              company: profile.company ?? "",
              jobTitle: profile.job_title ?? "",
              timezone: ACCOUNT_TIMEZONE,
            }}
            initialAvatarUrl={avatar?.signedUrl ?? null}
          />
        </div>
      </div>
    </div>
  );
}
