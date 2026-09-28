import Link from "next/link";
import { requireActiveUser } from "@/lib/access";
import { AccountSecurityPanel } from "@/components/AccountSecurityPanel";

export const dynamic = "force-dynamic";

export default async function SecuritySettingsPage() {
  const { user, profile, service } = await requireActiveUser();
  const providers = [...new Set((user.identities ?? []).map((identity) => identity.provider))];
  const { data: passwordEnabled } = await service.rpc("auth_password_enabled", {
    p_profile_id: profile.id,
  });

  return (
    <div className="min-h-screen px-5 py-7 sm:px-8 lg:px-10">
      <div className="mx-auto max-w-3xl">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-icon-primary">Profile &amp; settings</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight">Account &amp; Security</h1>
            <p className="mt-2 text-sm text-icon-text-light">Manage verified sign-in methods and active sessions.</p>
          </div>
          <Link href="/settings/profile" className="rounded-lg border border-icon-border px-4 py-2.5 text-sm font-semibold hover:border-icon-primary">My Profile</Link>
        </header>
        <div className="mt-7">
          <AccountSecurityPanel
            email={profile.email}
            providers={providers}
            passwordEnabled={Boolean(passwordEnabled)}
          />
        </div>
      </div>
    </div>
  );
}
