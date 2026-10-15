import test from "node:test";
import assert from "node:assert/strict";
import { createContingency, classifyFailure } from "./contingency.mjs";

const user = { id: "one", username: "staff", role: "STAFF" };
const snapshot = () => ({ schedules: [{ id: "s1" }], passengers: [], bookings: [] });
const network = () => new TypeError("Failed to fetch");
const deferred = () => { let resolve; let reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
const ready = async () => { const store = createContingency(() => "2026-10-14T10:00:00Z"); await store.loadWithContingency(user, async () => snapshot()); return store; };

test("initial failure is unavailable; no fabricated data or write access", async () => {
  const store = createContingency();
  await store.loadWithContingency(user, async () => { throw network(); });
  assert.equal(store.getState().status, "unavailable");
  assert.equal(store.getState().snapshot, null);
  let called = false;
  await assert.rejects(store.runWrite(async () => { called = true; }));
  assert.equal(called, false);
});

test("complete success becomes ready; outage retains only the last complete snapshot", async () => {
  const store = await ready();
  await store.loadWithContingency(user, async () => { throw network(); });
  assert.equal(store.getState().status, "stale");
  assert.deepEqual(store.getState().snapshot, snapshot());
  assert.equal(store.getState().refreshedAt, "2026-10-14T10:00:00Z");
  assert.throws(() => store.assertReady());
});

test("loading blocks writes; successful live reads restore readiness", async () => {
  const store = await ready(); const pending = deferred();
  const load = store.loadWithContingency(user, () => pending.promise);
  assert.equal(store.getState().status, "loading");
  assert.throws(() => store.assertReady());
  pending.resolve(snapshot()); await load;
  assert.doesNotThrow(() => store.assertReady());
});

test("online events cannot restore readiness, including an old in-flight read", async () => {
  const store = await ready(); const pending = deferred();
  const load = store.loadWithContingency(user, () => pending.promise);
  store.setOffline(true); store.setOffline(false);
  pending.resolve(snapshot()); await load;
  assert.equal(store.getState().status, "stale");
  await store.loadWithContingency(user, async () => snapshot());
  assert.equal(store.getState().status, "ready");
});

test("authorization failures purge retained data and timestamps", async () => {
  for (const error of [{ code: "42501", message: "permission denied" }, { status: 401 }, { code: "PGRST301" }]) {
    const store = await ready();
    await store.loadWithContingency(user, async () => { throw error; });
    assert.equal(store.getState().snapshot, null);
    assert.equal(store.getState().refreshedAt, null);
    assert.equal(store.getState().status, "unavailable");
  }
});

test("schema and validation failures never activate stale fallback", async () => {
  for (const error of [{ code: "42P01", message: "missing table" }, { code: "23514" }, new Error("Invalid seats.")]) {
    assert.equal(classifyFailure(error), "other");
    const store = await ready();
    await store.loadWithContingency(user, async () => { throw error; });
    assert.equal(store.getState().snapshot, null);
  }
});

test("HTTP validation and rate limits are not classified as connectivity", () => {
  assert.equal(classifyFailure({ status: 400, message: "network field is invalid" }), "other");
  assert.equal(classifyFailure({ status: 429, message: "timed out" }), "other");
});

test("an older same-account authorization denial invalidates newer reads", async () => {
  const store = await ready(); const old = deferred(); const newer = deferred();
  const first = store.loadWithContingency(user, () => old.promise);
  const second = store.loadWithContingency(user, () => newer.promise);
  old.reject({ status: 403 }); await first;
  newer.resolve(snapshot()); await second;
  assert.equal(store.getState().snapshot, null);
  assert.equal(store.getState().status, "unavailable");
});

test("incomplete snapshots cannot become ready", async () => {
  const store = await ready();
  await store.loadWithContingency(user, async () => ({ schedules: [] }));
  assert.equal(store.getState().status, "unavailable");
});

test("account changes and logout clear data and invalidate pending results", async () => {
  const store = await ready(); const pending = deferred();
  const load = store.loadWithContingency(user, () => pending.promise);
  store.setUser({ ...user, id: "two" });
  pending.resolve(snapshot()); await load;
  assert.equal(store.getState().snapshot, null);
  await store.loadWithContingency(user, async () => snapshot());
  store.clear();
  assert.equal(store.getScope(), null);
  assert.equal(store.getState().snapshot, null);
  assert.throws(() => store.assertReady());
});

test("latest read wins; older read cannot re-enable writes", async () => {
  const store = await ready(); const pending = deferred();
  const load = store.loadWithContingency(user, () => pending.promise);
  await store.loadWithContingency(user, async () => { throw network(); });
  pending.resolve(snapshot()); await load;
  assert.equal(store.getState().status, "stale");
});

test("confirmed write stays confirmed when refresh fails; writes never auto retry", async () => {
  const store = await ready(); let calls = 0;
  const result = await store.runWrite(async (beforeMutation) => { beforeMutation(); calls++; return "confirmed"; });
  await store.loadWithContingency(user, async () => { throw network(); });
  assert.equal(result, "confirmed");
  assert.equal(calls, 1);
  assert.equal(store.getState().status, "stale");
});

test("lost write response is uncertain and is not retried", async () => {
  const store = await ready(); let calls = 0;
  await assert.rejects(store.runWrite(async (beforeMutation) => { beforeMutation(); calls++; throw network(); }), (error) => error.uncertain === true && /outcome uncertain/.test(error.message));
  assert.equal(calls, 1);
  assert.equal(store.getState().status, "stale");
});

test("offline during write blocks refresh and further mutations until settlement", async () => {
  const store = await ready(); const pending = deferred();
  const write = store.runWrite(async (beforeMutation) => { beforeMutation(); await pending.promise; beforeMutation(); });
  store.setOffline(true);
  let read = false;
  await store.loadWithContingency(user, async () => { read = true; return snapshot(); });
  assert.equal(read, false);
  pending.resolve(); await assert.rejects(write, /outcome uncertain/);
  assert.throws(() => store.assertReady());
});

test("account change prevents subsequent steps of an old write", async () => {
  const store = await ready(); const pending = deferred();
  const write = store.runWrite(async (beforeMutation) => { beforeMutation(); await pending.promise; beforeMutation(); });
  store.setUser({ ...user, id: "two" });
  pending.resolve(); await assert.rejects(write, /outcome uncertain/);
  assert.equal(store.getState().snapshot, null);
});
