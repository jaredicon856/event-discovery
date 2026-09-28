import { redirect } from "next/navigation";
import { AccessError, requireActiveUser } from "@/lib/access";
import { getCreditBalance } from "@/lib/credits";
import { Sidebar } from "@/components/Sidebar";
import { ImpersonationBanner } from "@/components/ImpersonationBanner";
import { ScrollToHash } from "@/components/ScrollToHash";
import { isProfileComplete } from "@/lib/profileCompletion";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  let context;
  try {
    context = await requireActiveUser();
  } catch (error) {
    if (error instanceof AccessError) {
      redirect(`/login?access=${error.code}`);
    }
    throw error;
  }

  if (!isProfileComplete(context.profile)) {
    redirect("/onboarding");
  }

  const credits = await getCreditBalance(context.service, context.user.id);
  const displayName =
    context.profile.display_name ||
    context.profile.full_name ||
    context.profile.email.split("@")[0];
  const { data: avatar } = context.profile.avatar_path
    ? await context.service.storage
        .from("profile-photos")
        .createSignedUrl(context.profile.avatar_path, 60 * 60)
    : { data: null };

  return (
    <div
      className={`flex h-full min-h-full flex-col min-[900px]:flex-row ${
        context.impersonation ? "pt-11" : ""
      }`}
    >
      {context.impersonation && <ImpersonationBanner targetEmail={context.profile.email} />}
      <Sidebar
        email={context.profile.email}
        role={context.profile.role}
        credits={credits}
        displayName={displayName}
        avatarUrl={avatar?.signedUrl ?? null}
      />
      <main className="theme-panel flex-1 overflow-y-auto bg-icon-background text-icon-text">
        {children}
        <ScrollToHash />
      </main>
    </div>
  );
}
