import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import test from "node:test";
import { createClient, type User } from "@supabase/supabase-js";
import { config } from "dotenv";
import { getCreditBalances } from "../src/lib/credits";
import { failExhaustedJobs } from "../src/lib/discovery";
import { recordAiUsage } from "../src/lib/aiUsage";

config({ path: ".env.local" });

const runIntegration = process.env.RUN_DATABASE_INTEGRATION === "1";
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

test("public signup, trial integrity, authorization, recovery, and customer isolation", {
  skip: !runIntegration,
  timeout: 60_000,
}, async () => {
  assert.ok(url && anonKey && serviceKey, "Supabase integration environment is incomplete");
  const service = createClient(url, serviceKey, { auth: { persistSession: false } });
  const suffix = `${Date.now()}-${randomUUID().slice(0, 8)}`;
  const password = `EventScout-${randomUUID()}!`;
  const emailA = `event-scout-test-a-${suffix}@example.com`;
  const emailB = `event-scout-test-b-${suffix}@example.com`;
  const createdUsers: User[] = [];
  const eventIds: string[] = [];
  const runIds: string[] = [];
  const invitationHashes: string[] = [];
  const persistentOperationKeys: string[] = [];

  async function createTestUser(email: string, verified: boolean) {
    const { data, error } = await service.auth.admin.createUser({
      email,
      password,
      email_confirm: verified,
    });
    assert.ifError(error);
    assert.ok(data.user);
    createdUsers.push(data.user);
    return data.user;
  }

  try {
    const unverified = await createTestUser(emailA, false);
    const { data: deniedActivation } = await service.rpc("activate_public_account", {
      p_profile_id: unverified.id,
    });
    assert.equal(deniedActivation.activated, false);
    assert.equal(deniedActivation.reason, "unverified");

    const { error: verifyError } = await service.auth.admin.updateUserById(unverified.id, {
      email_confirm: true,
    });
    assert.ifError(verifyError);
    const { data: activationA, error: activationErrorA } = await service.rpc(
      "activate_public_account",
      { p_profile_id: unverified.id }
    );
    assert.ifError(activationErrorA);
    assert.equal(activationA.activated, true);
    assert.equal(activationA.trial_granted, true);
    const { data: testProfileClassification } = await service
      .from("profiles")
      .select("is_test_account")
      .eq("id", unverified.id)
      .single();
    assert.equal(testProfileClassification?.is_test_account, true);
    const freshTrialBalance = await getCreditBalances(service, unverified.id);
    assert.equal(freshTrialBalance.trial, 60);
    assert.equal(freshTrialBalance.total, 60);

    const userB = await createTestUser(emailB, true);
    const { data: activationB, error: activationErrorB } = await service.rpc(
      "activate_public_account",
      { p_profile_id: userB.id }
    );
    assert.ifError(activationErrorB);
    assert.equal(activationB.trial_granted, true);
    const [{ count: productionProfileCount }, { data: productionMetrics }] = await Promise.all([
      service.from("profiles").select("id", { count: "exact", head: true }).eq("is_test_account", false),
      service.rpc("get_admin_dashboard_metrics"),
    ]);
    assert.equal(Number(productionMetrics?.members_total), productionProfileCount);

    const { data: repeatActivation } = await service.rpc("activate_public_account", {
      p_profile_id: unverified.id,
    });
    assert.equal(repeatActivation.trial_granted, false);
    const { count: trialGrantCount } = await service
      .from("credit_ledger")
      .select("id", { count: "exact", head: true })
      .eq("profile_id", unverified.id)
      .eq("reason", "trial_grant");
    assert.equal(trialGrantCount, 1);
    const duplicateIdentity = await service.auth.admin.createUser({
      email: emailA,
      password: `Different-${password}`,
      email_confirm: true,
    });
    assert.ok(duplicateIdentity.error, "A second auth identity must not create another trial profile");

    const periodEnd = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    await service.from("subscriptions").insert({
      profile_id: userB.id,
      stripe_subscription_id: `sub_test_${suffix}`,
      stripe_customer_id: `cus_test_${suffix}`,
      plan: "starter",
      status: "active",
      credits_per_cycle: 1000,
      current_period_end: periodEnd,
    });
    const cycleArgs = {
      p_profile_id: userB.id,
      p_allowance: 1000,
      p_period_end: periodEnd,
      p_stripe_event_id: `evt_test_${suffix}`,
      p_stripe_invoice_id: `in_test_${suffix}`,
      p_note: "Integration renewal",
    };
    const { data: firstCycleGrant } = await service.rpc("grant_subscription_cycle", cycleArgs);
    const { data: duplicateCycleGrant } = await service.rpc("grant_subscription_cycle", cycleArgs);
    assert.equal(firstCycleGrant, 1000);
    assert.equal(duplicateCycleGrant, 0);
    const { count: monthlyGrantCount } = await service
      .from("credit_ledger")
      .select("id", { count: "exact", head: true })
      .eq("profile_id", userB.id)
      .eq("stripe_invoice_id", cycleArgs.p_stripe_invoice_id)
      .eq("reason", "monthly_grant");
    assert.equal(monthlyGrantCount, 1);

    const cronOperationKey = `schedule:test:${suffix}:2026-09-22`;
    const { data: claimedRun, error: claimedRunError } = await service
      .from("discovery_runs")
      .insert({
        profile_id: userB.id,
        operation_key: cronOperationKey,
        sector: "Integration",
        query: "Retry-safe schedule fixture",
      })
      .select("id")
      .single();
    assert.ifError(claimedRunError);
    runIds.push(claimedRun!.id);
    const { data: classifiedFixtureRun } = await service
      .from("discovery_runs")
      .select("run_kind")
      .eq("id", claimedRun!.id)
      .single();
    assert.equal(classifiedFixtureRun?.run_kind, "fixture");
    const { error: duplicateRunError } = await service.from("discovery_runs").insert({
      profile_id: userB.id,
      operation_key: cronOperationKey,
      sector: "Integration",
      query: "Retry-safe schedule fixture",
    });
    assert.equal(duplicateRunError?.code, "23505");

    const enqueueKey = `enqueue:${suffix}`;
    const balanceBeforeEnqueue = (await getCreditBalances(service, userB.id)).total;
    const { data: enqueued, error: enqueueError } = await service.rpc("enqueue_discovery_run", {
      p_profile_id: userB.id,
      p_sector: "Healthcare",
      p_query: "executive conferences",
      p_operation_key: enqueueKey,
      p_max_auto_contact_lookups: 2,
      p_criteria: { types: ["conference"] },
      p_displayed_credit_cap: 60,
    });
    assert.ifError(enqueueError);
    assert.equal(enqueued.status, "queued");
    runIds.push(enqueued.run_id);
    const { data: job } = await service.from("discovery_jobs").select("status, attempt_count").eq("run_id", enqueued.run_id).single();
    assert.equal(job?.status, "queued");
    const { data: debit } = await service.from("credit_operations").select("status, amount").eq("operation_key", `${enqueueKey}:discovery`).single();
    assert.equal(debit?.status, "charged");
    assert.equal(debit?.amount, 20);
    const { data: duplicateEnqueue } = await service.rpc("enqueue_discovery_run", {
      p_profile_id: userB.id,
      p_sector: "Healthcare",
      p_query: "executive conferences",
      p_operation_key: enqueueKey,
      p_max_auto_contact_lookups: 2,
    });
    assert.equal(duplicateEnqueue.status, "duplicate");
    assert.equal(duplicateEnqueue.run_id, enqueued.run_id);
    const { count: jobCount } = await service
      .from("discovery_jobs")
      .select("id", { count: "exact", head: true })
      .eq("run_id", enqueued.run_id);
    assert.equal(jobCount, 1);

    await service.from("discovery_jobs").update({ attempt_count: 3, status: "queued" }).eq("run_id", enqueued.run_id);
    const { data: claimed } = await service.rpc("claim_discovery_job", { p_limit: 5 });
    const claimedIds = (claimed ?? []).map((row: { run_id: string }) => row.run_id);
    assert.equal(claimedIds.includes(enqueued.run_id), false);
    const { data: exhaustedJob } = await service.from("discovery_jobs").select("status, last_error").eq("run_id", enqueued.run_id).single();
    assert.equal(exhaustedJob?.status, "failed");
    assert.equal(exhaustedJob?.last_error, "retry_exhausted");
    await failExhaustedJobs(service);
    const { data: exhaustedRun } = await service
      .from("discovery_runs")
      .select("status, credits_refunded")
      .eq("id", enqueued.run_id)
      .single();
    assert.equal(exhaustedRun?.status, "refunded");
    assert.equal(exhaustedRun?.credits_refunded, 20);
    const { data: refundedDiscoveryOperation } = await service
      .from("credit_operations")
      .select("status")
      .eq("operation_key", `${enqueueKey}:discovery`)
      .single();
    assert.equal(refundedDiscoveryOperation?.status, "refunded");
    assert.equal((await getCreditBalances(service, userB.id)).total, balanceBeforeEnqueue);

    const fencedRunKey = `lease-fence:${suffix}`;
    const { data: fencedRun, error: fencedRunError } = await service
      .from("discovery_runs")
      .insert({
        profile_id: userB.id,
        operation_key: fencedRunKey,
        sector: "Integration",
        query: "Lease fencing fixture",
      })
      .select("id")
      .single();
    assert.ifError(fencedRunError);
    runIds.push(fencedRun!.id);
    assert.ifError(
      (await service.from("discovery_jobs").insert({ run_id: fencedRun!.id, status: "queued" })).error
    );
    const { data: firstClaim } = await service.rpc("claim_discovery_job_for_run", {
      p_run_id: fencedRun!.id,
    });
    assert.ok(firstClaim?.lease_token);
    await service
      .from("discovery_jobs")
      .update({ lease_expires_at: new Date(Date.now() - 1000).toISOString() })
      .eq("run_id", fencedRun!.id);
    const { data: secondClaim } = await service.rpc("claim_discovery_job_for_run", {
      p_run_id: fencedRun!.id,
    });
    assert.ok(secondClaim?.lease_token);
    assert.notEqual(secondClaim.lease_token, firstClaim.lease_token);
    const { data: staleHeartbeat } = await service.rpc("heartbeat_discovery_job", {
      p_run_id: fencedRun!.id,
      p_lease_token: firstClaim.lease_token,
    });
    const { data: currentHeartbeat } = await service.rpc("heartbeat_discovery_job", {
      p_run_id: fencedRun!.id,
      p_lease_token: secondClaim.lease_token,
    });
    assert.equal(staleHeartbeat, false);
    assert.equal(currentHeartbeat, true);

    await recordAiUsage(service, {
      action: "extraction",
      profileId: userB.id,
      discoveryRunId: fencedRun!.id,
      creditsCharged: 0,
      usage: {
        inputTokens: 120,
        outputTokens: 40,
        cacheCreationInputTokens: 0,
        cacheReadInputTokens: 0,
        webSearchRequests: 0,
        estimatedCostUsd: 0.00064,
      },
    });
    const { data: telemetryRows } = await service
      .from("ai_usage")
      .select("input_tokens, output_tokens, estimated_cost_usd")
      .eq("discovery_run_id", fencedRun!.id)
      .eq("action", "extraction");
    assert.equal(telemetryRows?.length, 1);
    assert.equal(telemetryRows?.[0].input_tokens, 120);
    assert.equal(Number(telemetryRows?.[0].estimated_cost_usd), 0.00064);

    const discoveryKey = `test:${suffix}:discovery`;
    const { data: discoveryDebit } = await service.rpc("debit_credits_v2", {
      p_profile_id: unverified.id,
      p_amount: 20,
      p_reason: "discovery_usage",
      p_operation_key: discoveryKey,
    });
    assert.equal(discoveryDebit.status, "charged");
    assert.deepEqual(discoveryDebit.breakdown, { trial: 20 });
    await service.rpc("complete_credit_operation", { p_operation_key: discoveryKey });
    const { data: duplicateDiscovery } = await service.rpc("debit_credits_v2", {
      p_profile_id: unverified.id,
      p_amount: 20,
      p_reason: "discovery_usage",
      p_operation_key: discoveryKey,
    });
    assert.equal(duplicateDiscovery.duplicate, true);
    assert.equal(duplicateDiscovery.status, "completed");

    const refundedKey = `test:${suffix}:enrichment-refund`;
    await service.rpc("debit_credits_v2", {
      p_profile_id: unverified.id,
      p_amount: 20,
      p_reason: "enrichment_usage",
      p_operation_key: refundedKey,
    });
    const { data: refunded } = await service.rpc("refund_credit_operation", {
      p_operation_key: refundedKey,
    });
    assert.equal(refunded, true);
    for (const key of [`test:${suffix}:enrichment-1`, `test:${suffix}:enrichment-2`]) {
      const { data } = await service.rpc("debit_credits_v2", {
        p_profile_id: unverified.id,
        p_amount: 20,
        p_reason: "enrichment_usage",
        p_operation_key: key,
      });
      assert.equal(data.status, "charged");
      await service.rpc("complete_credit_operation", { p_operation_key: key });
    }
    const { data: exhausted } = await service.rpc("debit_credits_v2", {
      p_profile_id: unverified.id,
      p_amount: 20,
      p_reason: "enrichment_usage",
      p_operation_key: `test:${suffix}:enrichment-exhausted`,
    });
    assert.equal(exhausted.status, "insufficient");

    const expiredAt = new Date(Date.now() - 60_000).toISOString();
    await service.from("subscriptions").insert({
      profile_id: unverified.id,
      stripe_subscription_id: `sub_expired_${suffix}`,
      stripe_customer_id: `cus_expired_${suffix}`,
      plan: "starter",
      status: "canceled",
      credits_per_cycle: 1000,
      current_period_end: expiredAt,
      access_ends_at: expiredAt,
    });
    await service.from("credit_ledger").insert({
      profile_id: unverified.id,
      delta: 1000,
      reason: "monthly_grant",
      balance_bucket: "subscription",
      expires_at: expiredAt,
      note: "Expired cancellation fixture",
    });
    await service.from("credit_ledger").insert({
      profile_id: unverified.id,
      delta: 20,
      reason: "admin_adjustment",
      balance_bucket: "manual",
      note: "Integration recovery fixture",
    });
    const interruptedKey = `test:${suffix}:interrupted`;
    const { data: interrupted } = await service.rpc("debit_credits_v2", {
      p_profile_id: unverified.id,
      p_amount: 20,
      p_reason: "enrichment_usage",
      p_operation_key: interruptedKey,
    });
    assert.deepEqual(interrupted.breakdown, { manual: 20 });
    await service.rpc("recover_stale_credit_operations", { p_older_than: "0 seconds" });
    const { data: recoveredOperation } = await service
      .from("credit_operations")
      .select("status")
      .eq("operation_key", interruptedKey)
      .single();
    assert.equal(recoveredOperation?.status, "refunded");

    const { data: events, error: eventError } = await service
      .from("events")
      .insert([
        { sector: "Integration", event_name: `Customer A ${suffix}`, source_url: `https://example.com/a-${suffix}` },
        { sector: "Integration", event_name: `Customer B ${suffix}`, source_url: `https://example.com/b-${suffix}` },
      ])
      .select("id");
    assert.ifError(eventError);
    assert.equal(events?.length, 2);
    eventIds.push(...events!.map((event) => event.id));

    const { data: runs, error: runError } = await service
      .from("discovery_runs")
      .insert([
        { profile_id: unverified.id, sector: "Integration", query: "Customer A private", status: "completed" },
        { profile_id: userB.id, sector: "Integration", query: "Customer B private", status: "completed" },
      ])
      .select("id, profile_id");
    assert.ifError(runError);
    assert.equal(runs?.length, 2);
    runIds.push(...runs!.map((run) => run.id));
    const runA = runs!.find((run) => run.profile_id === unverified.id)!;
    const runB = runs!.find((run) => run.profile_id === userB.id)!;
    await service.from("discovery_run_events").insert([
      { discovery_run_id: runA.id, event_id: eventIds[0] },
      { discovery_run_id: runB.id, event_id: eventIds[1] },
    ]);
    const { data: contacts } = await service
      .from("contacts")
      .insert([
        { event_id: eventIds[0], name: "Private A", email: `a-${suffix}@example.com` },
        { event_id: eventIds[1], name: "Private B", email: `b-${suffix}@example.com` },
      ])
      .select("id, event_id");
    await service.from("customer_event_contacts").insert([
      { profile_id: unverified.id, event_id: eventIds[0], contact_id: contacts![0].id, discovery_run_id: runA.id },
      { profile_id: userB.id, event_id: eventIds[1], contact_id: contacts![1].id, discovery_run_id: runB.id },
    ]);

    const clientA = createClient(url, anonKey, { auth: { persistSession: false } });
    const clientB = createClient(url, anonKey, { auth: { persistSession: false } });
    assert.ifError((await clientA.auth.signInWithPassword({ email: emailA, password })).error);
    assert.ifError((await clientB.auth.signInWithPassword({ email: emailB, password })).error);
    const { data: visibleRunsA } = await clientA.from("discovery_runs").select("id");
    const { data: visibleRunsB } = await clientB.from("discovery_runs").select("id");
    assert.deepEqual(visibleRunsA?.map((run) => run.id), [runA.id]);
    assert.ok(visibleRunsB?.some((run) => run.id === runB.id));
    assert.ok(visibleRunsB?.every((run) => run.id !== runA.id));
    const { data: linksA } = await clientA.from("customer_event_contacts").select("contact_id");
    const { data: linksB } = await clientB.from("customer_event_contacts").select("contact_id");
    assert.deepEqual(linksA?.map((link) => link.contact_id), [contacts![0].id]);
    assert.deepEqual(linksB?.map((link) => link.contact_id), [contacts![1].id]);
    const directEvents = await clientA.from("events").select("id");
    assert.equal(directEvents.error, null);
    assert.deepEqual(directEvents.data, [], "Direct shared event cache access must return no rows");
    assert.ok(
      (await clientA.rpc("admin_adjust_manual_credits", {
        p_actor_profile_id: unverified.id,
        p_target_profile_id: unverified.id,
        p_amount: 100,
        p_reason: "Unauthorized test",
      })).error,
      "Customer must not execute admin credit RPC"
    );
    const spoofedRole = await clientA
      .from("profiles")
      .update({ role: "super_admin" })
      .eq("id", unverified.id);
    assert.ok(spoofedRole.error, "Direct profile requests must not modify privileged fields");
    const { data: updatedProfile, error: profileUpdateError } = await clientA.rpc(
      "update_own_profile",
      {
        p_full_name: "Integration Customer A",
        p_display_name: "Customer A",
        p_company: "Test Company",
        p_job_title: "Tester",
        p_timezone: "UTC",
      }
    );
    assert.ifError(profileUpdateError);
    assert.equal(updatedProfile?.display_name, "Customer A");
    const otherUserAvatar = await clientA.rpc("update_own_profile", {
      p_full_name: "Integration Customer A",
      p_display_name: "Customer A",
      p_company: "Test Company",
      p_job_title: "Tester",
      p_timezone: "UTC",
      p_avatar_path: `${userB.id}/avatar-not-owned.png`,
    });
    assert.ok(otherUserAvatar.error, "Avatar path must remain inside the authenticated user's folder");

    const ownAvatarPath = `${unverified.id}/avatar-${randomUUID()}.png`;
    const onePixelPng = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
      "base64"
    );
    const ownUpload = await clientA.storage
      .from("profile-photos")
      .upload(ownAvatarPath, onePixelPng, { contentType: "image/png" });
    assert.ok(ownUpload.error, "Direct storage writes must use the validated profile API");

    const inviteToken = randomUUID();
    const inviteHash = createHash("sha256").update(inviteToken).digest("hex");
    invitationHashes.push(inviteHash);
    await service.from("invitations").insert({
      email: emailB,
      token_hash: inviteHash,
      expires_at: new Date(Date.now() + 3_600_000).toISOString(),
    });
    const { data: invitationAccepted } = await service.rpc("accept_invitation", {
      p_profile_id: userB.id,
      p_token_hash: inviteHash,
    });
    assert.equal(invitationAccepted, true);
    const { data: profileB } = await service
      .from("profiles")
      .select("role")
      .eq("id", userB.id)
      .single();
    assert.equal(profileB?.role, "user");

    const { data: owner } = await service
      .from("profiles")
      .select("id")
      .eq("email", "admin@projecticon.io")
      .single();
    const ownerOperationKey = `test:${suffix}:owner-unbilled`;
    persistentOperationKeys.push(ownerOperationKey);
    const { count: ownerSubscriptions } = await service
      .from("subscriptions")
      .select("id", { count: "exact", head: true })
      .eq("profile_id", owner!.id);
    const { data: ownerDebit, error: ownerDebitError } = await service.rpc("debit_credits_v2", {
      p_profile_id: owner!.id,
      p_amount: 20,
      p_reason: "discovery_usage",
      p_operation_key: ownerOperationKey,
    });
    assert.ifError(ownerDebitError);
    assert.equal(ownerSubscriptions, 0);
    assert.equal(ownerDebit.unbilled, true);
    assert.equal(ownerDebit.billing_mode, "owner_unbilled");
    const { data: ownerOperation } = await service
      .from("credit_operations")
      .select("id")
      .eq("operation_key", ownerOperationKey)
      .single();
    const { count: ownerLedgerDebits } = await service
      .from("credit_ledger")
      .select("id", { count: "exact", head: true })
      .eq("operation_id", ownerOperation!.id);
    assert.equal(ownerLedgerDebits, 0);
    const { data: ownerRefunded } = await service.rpc("refund_credit_operation", {
      p_operation_key: ownerOperationKey,
    });
    assert.equal(ownerRefunded, true);
    const { count: ownerRefundRows } = await service
      .from("credit_ledger")
      .select("id", { count: "exact", head: true })
      .eq("operation_id", ownerOperation!.id);
    assert.equal(ownerRefundRows, 0, "Owner recovery must never create refund credits");

    const { error: lastAdminError } = await service
      .from("profiles")
      .update({ access_status: "suspended" })
      .eq("id", owner!.id);
    assert.ok(lastAdminError);

    assert.ifError(
      (await service.from("profiles").update({ role: "super_admin", access_status: "suspended", disabled: true }).eq("id", userB.id)).error
    );
    const { error: suspendedAdminSpendError } = await service.rpc("debit_credits_v2", {
      p_profile_id: userB.id,
      p_amount: 20,
      p_reason: "discovery_usage",
      p_operation_key: `test:${suffix}:suspended-admin`,
    });
    assert.ok(suspendedAdminSpendError);

    assert.ifError(
      (await service.from("profiles").update({ access_status: "suspended", disabled: true }).eq("id", unverified.id)).error
    );
    const { error: suspendedSpendError } = await service.rpc("debit_credits_v2", {
      p_profile_id: unverified.id,
      p_amount: 20,
      p_reason: "enrichment_usage",
      p_operation_key: `test:${suffix}:suspended`,
    });
    assert.ok(suspendedSpendError);
  } finally {
    if (persistentOperationKeys.length) {
      await service.from("credit_operations").delete().in("operation_key", persistentOperationKeys);
    }
    if (invitationHashes.length) await service.from("invitations").delete().in("token_hash", invitationHashes);
    if (runIds.length) await service.from("discovery_runs").delete().in("id", runIds);
    if (eventIds.length) await service.from("events").delete().in("id", eventIds);
    for (const user of createdUsers) {
      await service.auth.admin.deleteUser(user.id);
    }
    await service.from("trial_claims").delete().like("normalized_email", `event-scout-test-%-${suffix}@example.com`);
  }
});
