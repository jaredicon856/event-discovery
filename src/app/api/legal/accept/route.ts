import { NextResponse } from "next/server";
import { accessErrorResponse, requireActiveUser } from "@/lib/access";
import { hasAcceptedCurrentTerms, recordConsent } from "@/lib/consent";

export async function POST() {
  try {
    const { profile, service, impersonation } = await requireActiveUser();
    // An admin using "Login as" must never accept the terms for the customer.
    if (impersonation) {
      return NextResponse.json({ error: "Not available while viewing as a customer" }, { status: 403 });
    }
    if (!(await hasAcceptedCurrentTerms(service, profile.id))) {
      await recordConsent(service, profile.id, "gate");
    }
    return NextResponse.json({ accepted: true });
  } catch (error) {
    return accessErrorResponse(error) ?? NextResponse.json({ error: "Could not record acceptance" }, { status: 500 });
  }
}
