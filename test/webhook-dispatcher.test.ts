import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { test } from "node:test";
import { WebhookDispatcher, type Transport } from "../src/webhook-dispatcher.js";

function alwaysSucceeds(): Transport {
  return async () => {};
}

function alwaysFails(message = "boom"): Transport {
  return async () => {
    throw new Error(message);
  };
}

function sequence(...results: Array<"ok" | "fail">): Transport {
  let index = 0;
  return async () => {
    const result = results[index] ?? results[results.length - 1];
    index++;
    if (result === "fail") {
      throw new Error("boom");
    }
  };
}

test("registering a subscriber returns an id", () => {
  const dispatcher = new WebhookDispatcher(alwaysSucceeds(), { baseDelayMs: 100, maxAttempts: 3 });

  const id = dispatcher.register("https://example.com/hook", "s3cret");

  assert.equal(typeof id, "string");
  assert.ok(id.length > 0);
});

test("looking up an unknown subscriber id returns undefined", () => {
  const dispatcher = new WebhookDispatcher(alwaysSucceeds(), { baseDelayMs: 100, maxAttempts: 3 });

  assert.equal(dispatcher.getSubscriber("nope"), undefined);
});

test("looking up a registered subscriber returns it", () => {
  const dispatcher = new WebhookDispatcher(alwaysSucceeds(), { baseDelayMs: 100, maxAttempts: 3 });
  const id = dispatcher.register("https://example.com/hook", "s3cret");

  const subscriber = dispatcher.getSubscriber(id);

  assert.equal(subscriber?.url, "https://example.com/hook");
  assert.equal(subscriber?.secret, "s3cret");
});

test("sending computes an HMAC-SHA256 signature over the JSON payload and passes it to the transport", async () => {
  let seen: { url: string; payload: string; signature: string } | undefined;
  const transport: Transport = async (url, payload, signature) => {
    seen = { url, payload, signature };
  };
  const dispatcher = new WebhookDispatcher(transport, { baseDelayMs: 100, maxAttempts: 3 });
  const id = dispatcher.register("https://example.com/hook", "s3cret");

  await dispatcher.send(id, { type: "order.created", id: 42 });

  const expectedPayload = JSON.stringify({ type: "order.created", id: 42 });
  const expectedSignature = createHmac("sha256", "s3cret").update(expectedPayload).digest("hex");

  assert.equal(seen?.url, "https://example.com/hook");
  assert.equal(seen?.payload, expectedPayload);
  assert.equal(seen?.signature, expectedSignature);
});

test("a delivery the transport resolves is recorded as delivered", async () => {
  const dispatcher = new WebhookDispatcher(alwaysSucceeds(), { baseDelayMs: 100, maxAttempts: 3 });
  const id = dispatcher.register("https://example.com/hook", "s3cret");

  const record = await dispatcher.send(id, { hello: "world" });

  assert.equal(record.status, "delivered");
  assert.equal(record.attempts, 1);
  assert.equal(record.lastError, null);
});

test("a delivery the transport rejects is recorded as retrying when attempts remain", async () => {
  const dispatcher = new WebhookDispatcher(alwaysFails("network error"), {
    baseDelayMs: 100,
    maxAttempts: 3,
  });
  const id = dispatcher.register("https://example.com/hook", "s3cret");

  const record = await dispatcher.send(id, { hello: "world" });

  assert.equal(record.status, "retrying");
  assert.equal(record.attempts, 1);
  assert.equal(record.lastError, "network error");
});

test("a failed delivery never logs the subscriber's signing secret", async (t) => {
  const errorSpy = t.mock.method(console, "error", () => {});
  const dispatcher = new WebhookDispatcher(alwaysFails("network error"), {
    baseDelayMs: 100,
    maxAttempts: 3,
  });
  const id = dispatcher.register("https://example.com/hook", "s3cret");

  await dispatcher.send(id, { hello: "world" });

  assert.ok(errorSpy.mock.calls.length > 0, "expected the failure to be logged");
  for (const call of errorSpy.mock.calls) {
    for (const arg of call.arguments) {
      const serialized = typeof arg === "string" ? arg : JSON.stringify(arg);
      assert.ok(
        !serialized.includes("s3cret"),
        `console.error call leaked the signing secret: ${serialized}`
      );
    }
  }
});

test("a delivery is abandoned once max attempts is reached", async () => {
  const dispatcher = new WebhookDispatcher(alwaysFails(), { baseDelayMs: 50, maxAttempts: 2 });
  const id = dispatcher.register("https://example.com/hook", "s3cret");

  const first = await dispatcher.send(id, { hello: "world" });
  assert.equal(first.status, "retrying");

  const second = await dispatcher.retry(first.id);
  assert.equal(second?.status, "abandoned");
  assert.equal(second?.attempts, 2);
});

test("each retry's delay doubles the previous one starting from the base delay", async () => {
  const dispatcher = new WebhookDispatcher(alwaysFails(), { baseDelayMs: 100, maxAttempts: 4 });
  const id = dispatcher.register("https://example.com/hook", "s3cret");

  const first = await dispatcher.send(id, {});
  assert.equal(first.nextDelayMs, 100);

  const second = await dispatcher.retry(first.id);
  assert.equal(second?.nextDelayMs, 200);

  const third = await dispatcher.retry(second!.id);
  assert.equal(third?.nextDelayMs, 400);
});

test("sending to an unknown subscriber id abandons immediately without calling the transport", async () => {
  let called = false;
  const transport: Transport = async () => {
    called = true;
  };
  const dispatcher = new WebhookDispatcher(transport, { baseDelayMs: 100, maxAttempts: 3 });

  const record = await dispatcher.send("nope", { hello: "world" });

  assert.equal(record.status, "abandoned");
  assert.equal(record.attempts, 0);
  assert.equal(called, false);
});

test("an unknown-subscriber delivery does not count against retries", async () => {
  const dispatcher = new WebhookDispatcher(alwaysSucceeds(), { baseDelayMs: 100, maxAttempts: 1 });

  const record = await dispatcher.send("nope", { hello: "world" });

  // maxAttempts of 1 would abandon a real send after one failed attempt;
  // an unknown subscriber must still short-circuit with attempts at 0.
  assert.equal(record.attempts, 0);
  assert.equal(record.status, "abandoned");
});

test("retrying a delivery that is not currently retrying has no effect", async () => {
  const dispatcher = new WebhookDispatcher(alwaysSucceeds(), { baseDelayMs: 100, maxAttempts: 3 });
  const id = dispatcher.register("https://example.com/hook", "s3cret");
  const delivered = await dispatcher.send(id, {});

  const result = await dispatcher.retry(delivered.id);

  assert.equal(result, undefined);
});

test("retrying an unknown delivery id has no effect", async () => {
  const dispatcher = new WebhookDispatcher(alwaysSucceeds(), { baseDelayMs: 100, maxAttempts: 3 });

  const result = await dispatcher.retry("does-not-exist");

  assert.equal(result, undefined);
});

test("a successful retry moves the delivery to delivered", async () => {
  const dispatcher = new WebhookDispatcher(sequence("fail", "ok"), {
    baseDelayMs: 100,
    maxAttempts: 3,
  });
  const id = dispatcher.register("https://example.com/hook", "s3cret");

  const first = await dispatcher.send(id, {});
  assert.equal(first.status, "retrying");

  const second = await dispatcher.retry(first.id);

  assert.equal(second?.status, "delivered");
  assert.equal(second?.attempts, 2);
});

test("a failed retry with attempts remaining schedules another retry", async () => {
  const dispatcher = new WebhookDispatcher(alwaysFails(), { baseDelayMs: 100, maxAttempts: 5 });
  const id = dispatcher.register("https://example.com/hook", "s3cret");

  const first = await dispatcher.send(id, {});
  const second = await dispatcher.retry(first.id);

  assert.equal(second?.status, "retrying");
  assert.equal(second?.attempts, 2);
});

test("delivery history for a subscriber is returned newest first", async () => {
  const dispatcher = new WebhookDispatcher(alwaysSucceeds(), { baseDelayMs: 100, maxAttempts: 3 });
  const id = dispatcher.register("https://example.com/hook", "s3cret");

  const first = await dispatcher.send(id, { seq: 1 });
  const second = await dispatcher.send(id, { seq: 2 });

  const history = dispatcher.getHistory(id);

  assert.deepEqual(
    history.map((r) => r.id),
    [second.id, first.id]
  );
});

test("delivery history only includes deliveries for the requested subscriber", async () => {
  const dispatcher = new WebhookDispatcher(alwaysSucceeds(), { baseDelayMs: 100, maxAttempts: 3 });
  const a = dispatcher.register("https://a.example.com/hook", "secret-a");
  const b = dispatcher.register("https://b.example.com/hook", "secret-b");

  await dispatcher.send(a, { for: "a" });
  await dispatcher.send(b, { for: "b" });

  const historyA = dispatcher.getHistory(a);

  assert.equal(historyA.length, 1);
  assert.equal(historyA[0]?.subscriberId, a);
});

test("a retried delivery keeps a single entry in the history, updated in place", async () => {
  const dispatcher = new WebhookDispatcher(sequence("fail", "ok"), {
    baseDelayMs: 100,
    maxAttempts: 3,
  });
  const id = dispatcher.register("https://example.com/hook", "s3cret");

  const first = await dispatcher.send(id, {});
  await dispatcher.retry(first.id);

  const history = dispatcher.getHistory(id);

  assert.equal(history.length, 1);
  assert.equal(history[0]?.status, "delivered");
});

test("interleaved deliveries to the same subscriber each keep a single history entry", async () => {
  // First two sends both fail (attempt 1 for A, attempt 1 for B), then A's retry succeeds.
  // At that point A's id is not the last entry pushed for the subscriber (B's is), so a
  // dedupe check that only looks at the last array element misses the existing entry for A
  // and appends a duplicate.
  const dispatcher = new WebhookDispatcher(sequence("fail", "fail", "ok", "ok"), {
    baseDelayMs: 100,
    maxAttempts: 3,
  });
  const id = dispatcher.register("https://example.com/hook", "s3cret");

  const a = await dispatcher.send(id, { seq: "A" });
  const b = await dispatcher.send(id, { seq: "B" });
  await dispatcher.retry(a.id);

  const history = dispatcher.getHistory(id);

  assert.deepEqual(
    history.map((r) => r.id).sort(),
    [a.id, b.id].sort()
  );
});

test("getCounts reports how many deliveries are in each status across all subscribers", async () => {
  const dispatcher = new WebhookDispatcher(alwaysSucceeds(), { baseDelayMs: 100, maxAttempts: 3 });
  const a = dispatcher.register("https://a.example.com/hook", "secret-a");
  const b = dispatcher.register("https://b.example.com/hook", "secret-b");

  await dispatcher.send(a, {});
  await dispatcher.send(b, {});
  await dispatcher.send("nope", {});

  const counts = dispatcher.getCounts();

  assert.equal(counts.delivered, 2);
  assert.equal(counts.abandoned, 1);
  assert.equal(counts.retrying, 0);
});

test("constructing with a non-positive baseDelayMs throws", () => {
  assert.throws(() => new WebhookDispatcher(alwaysSucceeds(), { baseDelayMs: 0, maxAttempts: 3 }), RangeError);
});

test("constructing with a non-positive-integer maxAttempts throws", () => {
  assert.throws(
    () => new WebhookDispatcher(alwaysSucceeds(), { baseDelayMs: 100, maxAttempts: 0 }),
    RangeError
  );
  assert.throws(
    () => new WebhookDispatcher(alwaysSucceeds(), { baseDelayMs: 100, maxAttempts: 1.5 }),
    RangeError
  );
});
