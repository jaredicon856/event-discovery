import { config } from "dotenv";

config({ path: ".env.local" });

const pollMs = Math.max(1_000, Number(process.env.DISCOVERY_WORKER_POLL_MS ?? 5_000));
let stopping = false;
let processing = false;

async function tick(
  supabase: import("@supabase/supabase-js").SupabaseClient,
  processQueuedDiscoveryJobs: typeof import("../src/lib/discovery").processQueuedDiscoveryJobs
) {
  if (processing || stopping) return;
  processing = true;
  try {
    const processed = await processQueuedDiscoveryJobs(supabase, 3);
    if (processed > 0) {
      console.log(`[discovery-worker] processed ${processed} job(s)`);
    }
  } catch (error) {
    console.error("[discovery-worker] poll failed", error);
  } finally {
    processing = false;
  }
}

function stop() {
  stopping = true;
  console.log("[discovery-worker] stopping after current poll");
}

process.on("SIGINT", stop);
process.on("SIGTERM", stop);

async function main() {
  const [{ processQueuedDiscoveryJobs }, { getSupabaseServiceClient }] = await Promise.all([
    import("../src/lib/discovery"),
    import("../src/lib/supabase"),
  ]);
  const supabase = getSupabaseServiceClient();
  console.log(`[discovery-worker] polling queued and expired jobs every ${pollMs}ms`);
  await tick(supabase, processQueuedDiscoveryJobs);
  while (!stopping) {
    await new Promise((resolve) => setTimeout(resolve, pollMs));
    await tick(supabase, processQueuedDiscoveryJobs);
  }
}

main().catch((error) => {
  console.error("[discovery-worker] fatal error", error);
  process.exit(1);
});
