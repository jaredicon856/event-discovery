import assert from "node:assert/strict";
import test from "node:test";
import { coerceEventsArray } from "../src/lib/agent";

test("events written as a JSON string are read as the array they encode", () => {
  const rows = [{ event_name: "AHA Leadership Summit 2027", sector: "healthcare", status: "open" }];
  assert.deepEqual(coerceEventsArray(rows), rows);
  assert.deepEqual(coerceEventsArray(JSON.stringify(rows)), rows);
  assert.deepEqual(coerceEventsArray(JSON.stringify({ events: rows })), rows, "a wrapped list is unwrapped");
});

test("anything that is not a list of events is still rejected", () => {
  assert.equal(coerceEventsArray("not json"), null);
  assert.equal(coerceEventsArray('{"name":"x"}'), null);
  assert.equal(coerceEventsArray(null), null);
  assert.equal(coerceEventsArray(42), null);
});
