import Link from "next/link";
import { redirect } from "next/navigation";
import { AccessError, requireActiveUser } from "@/lib/access";
import { OnboardingProfileForm } from "@/components/OnboardingProfileForm";
import { isProfileComplete, namesFromAuthMetadata, splitPersonName } from "@/lib/profileCompletion";
import { formatAccountDate } from "@/lib/timezone";
import { effectiveTrial, TRIAL_DAYS, trialDaysLeftLabel } from "@/lib/trial";

export default async function OnboardingPage() {
  let context;
  try {
    context = await requireActiveUser();
  } catch (error) {
    if (error instanceof AccessError) redirect(`/login?access=${error.code}`);
    throw error;
  }

  const savedNames = splitPersonName(context.profile.full_name);
  const googleNames = namesFromAuthMetadata(context.user.user_metadata);
  const firstName = savedNames.firstName || googleNames.firstName;
  const lastName = savedNames.lastName || googleNames.lastName;
  const profileComplete = isProfileComplete(context.profile);

  if (!profileComplete) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#061b1c] px-6 py-12 text-white">
        <div className="w-full max-w-2xl rounded-2xl border border-white/10 bg-white/[0.04] p-7 shadow-2xl shadow-black/20 sm:p-10">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[#c59a48]">Complete your profile</p>
          <h1 className="mt-4 text-4xl font-semibold tracking-[-0.03em]">Tell us who this workspace is for.</h1>
          <p className="mt-4 max-w-xl text-base leading-7 text-white/65">
            Add your name so greetings, exports, and account details use the right person. Google can prefill this when it is available.
          </p>
          <OnboardingProfileForm
            email={context.profile.email}
            initialFirstName={firstName}
            initialLastName={lastName}
            initialCompany={context.profile.company ?? ""}
            initialJobTitle={context.profile.job_title ?? ""}
          />
        </div>
      </main>
    );
  }

  const { data: trialRow } = await context.service
    .from("trial_entitlements")
    .select("discovery_remaining, contact_lookups_remaining, expires_at")
    .eq("profile_id", context.profile.id)
    .maybeSingle();
  const trial = effectiveTrial(trialRow);

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#061b1c] px-6 py-12 text-white">
      <div className="w-full max-w-2xl rounded-2xl border border-white/10 bg-white/[0.04] p-7 shadow-2xl shadow-black/20 sm:p-10">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[#c59a48]">Your workspace is ready</p>
        <h1 className="mt-4 text-4xl font-semibold tracking-[-0.03em]">Find your first opportunity.</h1>
        <p className="mt-4 max-w-xl text-base leading-7 text-white/65">
          Your free trial includes one discovery search and organizer contact research for up to two returned events, valid for {TRIAL_DAYS} days. No card is required and your results remain private in this workspace.
        </p>
        {trial?.expiresAt && !trial.expired && (
          <p className="mt-3 text-sm font-semibold text-[#c59a48]">Trial ends {formatAccountDate(trial.expiresAt)} · {trialDaysLeftLabel(trial.daysLeft)}</p>
        )}
        <div className="mt-8 grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl border border-white/10 bg-black/10 p-5"><p className="text-sm text-white/55">Discovery searches</p><p className="mt-2 text-3xl font-semibold">{trial?.discoveryRemaining ?? 0}</p></div>
          <div className="rounded-xl border border-white/10 bg-black/10 p-5"><p className="text-sm text-white/55">Contact lookups</p><p className="mt-2 text-3xl font-semibold">{trial?.contactsRemaining ?? 0}</p></div>
        </div>
        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <Link href="/opportunities?tab=new" className="flex min-h-11 items-center justify-center rounded-lg bg-[#b0863c] px-5 text-sm font-semibold transition-colors hover:bg-[#96712f] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#c59a48]">Start my free search</Link>
          <Link href="/" className="flex min-h-11 items-center justify-center rounded-lg border border-white/15 px-5 text-sm font-semibold text-white/75 transition-colors hover:border-white/30 hover:text-white">Explore my workspace</Link>
        </div>
      </div>
    </main>
  );
}
