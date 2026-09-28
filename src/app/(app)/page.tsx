import { CustomerOverview } from "@/components/CustomerOverview";
import { OwnerOverview } from "@/components/OwnerOverview";
import { requireActiveUser } from "@/lib/access";

export const dynamic = "force-dynamic";

export default async function Home() {
  const { profile } = await requireActiveUser();
  return profile.role === "super_admin" ? <OwnerOverview /> : <CustomerOverview />;
}
