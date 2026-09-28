import { createHash, randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";

config({ path: ".env.local" });
config();

const OWNER_EMAIL = "admin@projecticon.io";
const command = process.argv[2];
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const appUrl = process.env.NEXT_PUBLIC_APP_URL;

if (!url || !serviceKey) {
  throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
}
if (!["invite", "promote", "status"].includes(command ?? "")) {
  throw new Error("Usage: npm run owner:bootstrap -- invite|promote|status");
}

const supabase = createClient(url, serviceKey, { auth: { persistSession: false } });

async function findOwnerUser() {
  for (let page = 1; page <= 10; page += 1) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 100 });
    if (error) throw error;
    const match = data.users.find((user) => user.email?.toLowerCase() === OWNER_EMAIL);
    if (match) return match;
    if (data.users.length < 100) break;
  }
  return null;
}

async function inviteOwner() {
  if (!appUrl) throw new Error("Set NEXT_PUBLIC_APP_URL to the app origin before sending an invite");
  const existing = await findOwnerUser();
  if (existing) {
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("role, access_status")
      .eq("id", existing.id)
      .single();
    if (
      profileError ||
      profile?.role !== "user" ||
      profile.access_status !== "pending"
    ) {
      throw new Error(`${OWNER_EMAIL} already has a non-pending identity; refusing to replace it`);
    }
    const [{ count: ledgerCount }, { count: runCount }] = await Promise.all([
      supabase
        .from("credit_ledger")
        .select("id", { count: "exact", head: true })
        .eq("profile_id", existing.id),
      supabase
        .from("discovery_runs")
        .select("id", { count: "exact", head: true })
        .eq("profile_id", existing.id),
    ]);
    if ((ledgerCount ?? 0) > 0 || (runCount ?? 0) > 0) {
      throw new Error("Pending owner identity has activity; refusing destructive invite rotation");
    }
    const { error: deleteError } = await supabase.auth.admin.deleteUser(existing.id);
    if (deleteError) throw deleteError;
  }

  await supabase
    .from("invitations")
    .update({ status: "revoked", revoked_at: new Date().toISOString() })
    .eq("email", OWNER_EMAIL)
    .eq("status", "pending");

  const token = randomBytes(32).toString("base64url");
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();
  const { error: insertError } = await supabase.from("invitations").insert({
    email: OWNER_EMAIL,
    token_hash: tokenHash,
    expires_at: expiresAt,
  });
  if (insertError) throw insertError;

  const callback = new URL("/auth/callback", appUrl);
  callback.searchParams.set("invite", token);
  callback.searchParams.set("next", "/set-password");
  const { error } = await supabase.auth.admin.inviteUserByEmail(OWNER_EMAIL, {
    redirectTo: callback.toString(),
  });
  if (error) {
    const { data: generated, error: linkError } = await supabase.auth.admin.generateLink({
      type: "invite",
      email: OWNER_EMAIL,
      options: { redirectTo: callback.toString() },
    });
    if (linkError) throw linkError;
    console.log(`Email delivery was rate-limited. Open this one-time owner link before ${expiresAt}:`);
    console.log(generated.properties.action_link);
    return;
  }
  console.log(`Owner invitation sent to ${OWNER_EMAIL}; expires ${expiresAt}.`);
}

async function promoteOwner() {
  const user = await findOwnerUser();
  if (!user) throw new Error("Owner auth identity does not exist; run invite first");
  if (!user.email_confirmed_at) {
    throw new Error("Owner must accept the invitation and verify authentication before promotion");
  }

  const { data: promoted, error } = await supabase.rpc("bootstrap_first_super_admin", {
    p_profile_id: user.id,
  });
  if (error) throw error;
  if (!promoted) {
    throw new Error("Bootstrap refused: invitation is not accepted or an active super-admin already exists");
  }
  console.log(`${OWNER_EMAIL} is now the initial super-admin.`);
}

async function status() {
  const user = await findOwnerUser();
  if (!user) {
    console.log("Owner auth identity: not created");
    return;
  }
  const { data: profile } = await supabase
    .from("profiles")
    .select("role, access_status")
    .eq("id", user.id)
    .single();
  console.log({
    email: OWNER_EMAIL,
    verified: Boolean(user.email_confirmed_at),
    role: profile?.role,
    accessStatus: profile?.access_status,
  });
}

async function main() {
  if (command === "invite") await inviteOwner();
  if (command === "promote") await promoteOwner();
  if (command === "status") await status();
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
