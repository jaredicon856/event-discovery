import { randomUUID } from "node:crypto";
import { CREDIT_COSTS } from "../../src/lib/credits";

/**
 * In-memory stand-in for the Supabase client used by the discovery worker.
 * It models the ledger, credit operations and lease rules closely enough that
 * worker tests can assert on real charges, refunds and run summaries instead of
 * on mocked return values.
 */

export type Row = Record<string, unknown>;
export type Tables = Record<string, Row[]>;

const CONFLICT_KEYS: Record<string, string[]> = {
  discovery_run_artifacts: ["run_id", "stage"],
  discovery_run_events: ["discovery_run_id", "event_id"],
  customer_event_contacts: ["profile_id", "event_id", "contact_id"],
};

interface Result<T> {
  data: T;
  error: { message: string } | null;
}

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

type Mode = "select" | "insert" | "update" | "upsert";

class FakeQuery implements PromiseLike<Result<Row[] | Row | null>> {
  private filters: Array<(row: Row) => boolean> = [];
  private orderBy: { column: string; ascending: boolean } | null = null;
  private limitCount: number | null = null;

  constructor(
    private tables: Tables,
    private table: string,
    private mode: Mode,
    private payload: Row[] | Row | null = null,
    private conflictColumns: string[] | null = null,
    private injectedError: (table: string, mode: Mode) => string | null = () => null
  ) {}

  private get rows(): Row[] {
    this.tables[this.table] ??= [];
    return this.tables[this.table];
  }

  select() {
    return this;
  }

  eq(column: string, value: unknown) {
    this.filters.push((row) => row[column] === value);
    return this;
  }

  in(column: string, values: unknown[]) {
    this.filters.push((row) => values.includes(row[column]));
    return this;
  }

  like(column: string, pattern: string) {
    const matcher = new RegExp(`^${pattern.split("%").map(escapeRegExp).join(".*")}$`);
    this.filters.push((row) => matcher.test(String(row[column] ?? "")));
    return this;
  }

  order(column: string, options?: { ascending?: boolean }) {
    this.orderBy = { column, ascending: options?.ascending ?? true };
    return this;
  }

  limit(count: number) {
    this.limitCount = count;
    return this;
  }

  private matching(): Row[] {
    let result = this.rows.filter((row) => this.filters.every((filter) => filter(row)));
    if (this.orderBy) {
      const { column, ascending } = this.orderBy;
      result = [...result].sort((a, b) =>
        ascending
          ? String(a[column] ?? "").localeCompare(String(b[column] ?? ""))
          : String(b[column] ?? "").localeCompare(String(a[column] ?? ""))
      );
    }
    if (this.limitCount !== null) result = result.slice(0, this.limitCount);
    return result;
  }

  private conflictKeys(): string[] {
    return this.conflictColumns ?? CONFLICT_KEYS[this.table] ?? ["id"];
  }

  private run(): Result<Row[]> {
    const injected = this.injectedError(this.table, this.mode);
    if (injected) return { data: [], error: { message: injected } };
    const payloadRows = this.payload === null ? [] : Array.isArray(this.payload) ? this.payload : [this.payload];
    switch (this.mode) {
      case "select":
        return { data: this.matching(), error: null };
      case "insert": {
        const inserted = payloadRows.map((row) => ({ id: randomUUID(), ...row }));
        this.rows.push(...inserted);
        return { data: inserted, error: null };
      }
      case "upsert": {
        const keys = this.conflictKeys();
        const saved: Row[] = [];
        for (const row of payloadRows) {
          const existing = this.rows.find((candidate) => keys.every((key) => candidate[key] === row[key]));
          if (existing) {
            Object.assign(existing, row);
            saved.push(existing);
          } else {
            const created = { id: randomUUID(), ...row };
            this.rows.push(created);
            saved.push(created);
          }
        }
        return { data: saved, error: null };
      }
      case "update": {
        const updated = this.matching();
        for (const row of updated) Object.assign(row, this.payload as Row);
        return { data: updated, error: null };
      }
    }
  }

  async maybeSingle(): Promise<Result<Row | null>> {
    const { data, error } = this.run();
    return { data: data[0] ?? null, error };
  }

  async single(): Promise<Result<Row | null>> {
    const { data, error } = this.run();
    if (error) return { data: null, error };
    if (data.length !== 1) return { data: null, error: { message: `Expected one ${this.table} row, found ${data.length}` } };
    return { data: data[0], error: null };
  }

  then<TResult1 = Result<Row[]>, TResult2 = never>(
    onfulfilled?: ((value: Result<Row[]>) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
  ): PromiseLike<TResult1 | TResult2> {
    return Promise.resolve(this.run()).then(onfulfilled, onrejected);
  }
}

/** Failure injection so error handling can be exercised at real boundaries. */
export interface FakeSupabaseFaults {
  query?: (table: string, mode: Mode) => string | null;
  rpc?: (name: string, args: Row) => string | null;
}

export interface FakeSupabase {
  tables: Tables;
  rpcCalls: Array<{ name: string; args: Row }>;
  faults: FakeSupabaseFaults;
  balanceOf(profileId: string): number;
  operationStatus(operationKey: string): string | null;
  from(table: string): FakeQuery;
  rpc(name: string, args?: Row): Promise<Result<unknown>>;
}

export function createFakeSupabase(seed: Tables = {}, faults: FakeSupabaseFaults = {}): FakeSupabase {
  const tables: Tables = {
    profiles: [],
    discovery_runs: [],
    discovery_jobs: [],
    discovery_run_artifacts: [],
    discovery_run_events: [],
    credit_ledger: [],
    credit_operations: [],
    subscriptions: [],
    events: [],
    contacts: [],
    customer_event_contacts: [],
    ai_usage: [],
    ...seed,
  };
  const rpcCalls: Array<{ name: string; args: Row }> = [];

  const balanceOf = (profileId: string) =>
    tables.credit_ledger
      .filter((row) => row.profile_id === profileId)
      .reduce((sum, row) => sum + Number(row.delta ?? 0), 0);

  const operationStatus = (operationKey: string) =>
    (tables.credit_operations.find((row) => row.operation_key === operationKey)?.status as string | undefined) ?? null;

  const rpcHandlers: Record<string, (args: Row) => unknown> = {
    heartbeat_discovery_job: (args) => {
      const job = tables.discovery_jobs.find((row) => row.run_id === args.p_run_id);
      return Boolean(job) && job?.lease_token === args.p_lease_token;
    },
    debit_credits_v2: (args) => {
      const operationKey = String(args.p_operation_key);
      const existing = tables.credit_operations.find((row) => row.operation_key === operationKey);
      if (existing) return { status: existing.status };
      const profileId = String(args.p_profile_id);
      const amount = Number(args.p_amount);
      const balance = balanceOf(profileId);
      if (balance < amount) return { status: "insufficient", balance };
      tables.credit_ledger.push({
        id: randomUUID(),
        profile_id: profileId,
        delta: -amount,
        reason: args.p_reason,
        balance_bucket: "subscription",
        operation_key: operationKey,
        related_event_id: args.p_related_event_id ?? null,
        discovery_run_id: args.p_discovery_run_id ?? null,
      });
      tables.credit_operations.push({
        id: randomUUID(),
        operation_key: operationKey,
        profile_id: profileId,
        amount,
        status: "charged",
      });
      return { status: "charged", balance: balanceOf(profileId) };
    },
    complete_credit_operation: (args) => {
      const operation = tables.credit_operations.find((row) => row.operation_key === args.p_operation_key);
      if (operation && operation.status === "charged") operation.status = "completed";
      return null;
    },
    refund_credit_operation: (args) => {
      const operation = tables.credit_operations.find((row) => row.operation_key === args.p_operation_key);
      if (!operation || !["charged", "completed"].includes(String(operation.status))) return false;
      tables.credit_ledger.push({
        id: randomUUID(),
        profile_id: operation.profile_id,
        delta: Number(operation.amount ?? CREDIT_COSTS.discovery),
        reason: "usage_refund",
        balance_bucket: "subscription",
        operation_key: `${operation.operation_key}:refund`,
      });
      operation.status = "refunded";
      return true;
    },
  };

  const queryFault = (table: string, mode: Mode) => faults.query?.(table, mode) ?? null;

  return {
    tables,
    rpcCalls,
    faults,
    balanceOf,
    operationStatus,
    from(table: string) {
      const builder = {
        select: () => new FakeQuery(tables, table, "select", null, null, queryFault),
        insert: (payload: Row | Row[]) => new FakeQuery(tables, table, "insert", payload, null, queryFault),
        upsert: (payload: Row | Row[], options?: { onConflict?: string }) =>
          new FakeQuery(
            tables,
            table,
            "upsert",
            payload,
            options?.onConflict ? options.onConflict.split(",").map((column) => column.trim()) : null,
            queryFault
          ),
        update: (payload: Row) => new FakeQuery(tables, table, "update", payload, null, queryFault),
      };
      return builder as unknown as FakeQuery;
    },
    async rpc(name: string, args: Row = {}) {
      rpcCalls.push({ name, args });
      const injected = faults.rpc?.(name, args);
      if (injected) return { data: null, error: { message: injected } };
      const handler = rpcHandlers[name];
      if (!handler) return { data: null, error: { message: `Unhandled rpc ${name}` } };
      return { data: handler(args), error: null };
    },
  };
}
