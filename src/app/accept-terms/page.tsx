import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AccessError, requireActiveUser } from "@/lib/access";
import { hasAcceptedCurrentTerms } from "@/lib/consent";
import { AcceptTermsForm } from "@/components/AcceptTermsForm";

export const metadata: Metadata = { title: "Review our terms | Event Scout", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function AcceptTermsPage() {
  let context;
  try {
    context = await requireActiveUser();
  } catch (error) {
    if (error instanceof AccessError) redirect(`/login?access=${error.code}`);
    throw error;
  }
  if (context.impersonation || context.profile.role === "super_admin") redirect("/");
  if (await hasAcceptedCurrentTerms(context.service, context.profile.id)) redirect("/");

  return <AcceptTermsForm email={context.profile.email} />;
}
