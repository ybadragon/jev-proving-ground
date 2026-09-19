import { createHmac } from "node:crypto";

/**
 * Delivers outgoing webhook notifications to registered subscribers, signs
 * each payload, and retries failed deliveries with doubling backoff.
 *
 * The caller decides when a retry actually happens (see `retry`); this
 * module never schedules anything on a timer itself.
 */

export type Transport = (url: string, payload: string, signature: string) => Promise<void>;

export type DeliveryStatus = "delivered" | "retrying" | "abandoned";

export interface Subscriber {
  readonly id: string;
  readonly url: string;
  readonly secret: string;
}

export interface DeliveryRecord {
  readonly id: string;
  readonly subscriberId: string;
  readonly event: unknown;
  readonly attempts: number;
  readonly status: DeliveryStatus;
  readonly nextDelayMs: number | null;
  readonly lastError: string | null;
}

export interface WebhookDispatcherOptions {
  readonly baseDelayMs: number;
  readonly maxAttempts: number;
}

export class WebhookDispatcher {
  private readonly transport: Transport;
  private readonly baseDelayMs: number;
  private readonly maxAttempts: number;

  private readonly subscribers = new Map<string, Subscriber>();
  private readonly deliveries = new Map<string, DeliveryRecord>();
  // Newest id last per subscriber; reversed on read for newest-first history.
  private readonly historyBySubscriber = new Map<string, string[]>();

  private nextSubscriberId = 1;
  private nextDeliveryId = 1;

  constructor(transport: Transport, options: WebhookDispatcherOptions) {
    if (!Number.isFinite(options.baseDelayMs) || options.baseDelayMs <= 0) {
      throw new RangeError("baseDelayMs must be a positive number");
    }
    if (!Number.isInteger(options.maxAttempts) || options.maxAttempts < 1) {
      throw new RangeError("maxAttempts must be a positive integer");
    }
    this.transport = transport;
    this.baseDelayMs = options.baseDelayMs;
    this.maxAttempts = options.maxAttempts;
  }

  /** Registers a subscriber and returns its id. */
  register(url: string, secret: string): string {
    const id = `sub-${this.nextSubscriberId++}`;
    this.subscribers.set(id, { id, url, secret });
    return id;
  }

  /** Looks up a subscriber by id, or `undefined` if it is not registered. */
  getSubscriber(subscriberId: string): Subscriber | undefined {
    return this.subscribers.get(subscriberId);
  }

  /**
   * Sends `event` to `subscriberId`. Signs the JSON-encoded payload with the
   * subscriber's secret and hands both to the transport. Records the
   * outcome as a new delivery.
   */
  async send(subscriberId: string, event: unknown): Promise<DeliveryRecord> {
    const subscriber = this.subscribers.get(subscriberId);
    const id = `del-${this.nextDeliveryId++}`;

    if (subscriber === undefined) {
      const record: DeliveryRecord = {
        id,
        subscriberId,
        event,
        attempts: 0,
        status: "abandoned",
        nextDelayMs: null,
        lastError: "unknown subscriber",
      };
      this.store(record);
      return record;
    }

    return this.attempt(subscriber, id, subscriberId, event, 1);
  }

  /**
   * Retries a delivery that is currently `retrying`. Has no effect and
   * returns `undefined` for a delivery that is missing or not `retrying`.
   */
  async retry(deliveryId: string): Promise<DeliveryRecord | undefined> {
    const existing = this.deliveries.get(deliveryId);
    if (existing === undefined || existing.status !== "retrying") {
      return undefined;
    }

    const subscriber = this.subscribers.get(existing.subscriberId);
    if (subscriber === undefined) {
      const record: DeliveryRecord = {
        ...existing,
        status: "abandoned",
        nextDelayMs: null,
        lastError: "unknown subscriber",
      };
      this.store(record);
      return record;
    }

    return this.attempt(
      subscriber,
      existing.id,
      existing.subscriberId,
      existing.event,
      existing.attempts + 1
    );
  }

  /** Delivery history for a subscriber, newest first. */
  getHistory(subscriberId: string): DeliveryRecord[] {
    const ids = this.historyBySubscriber.get(subscriberId) ?? [];
    return [...ids]
      .reverse()
      .map((id) => this.deliveries.get(id))
      .filter((record): record is DeliveryRecord => record !== undefined);
  }

  /** Count of deliveries currently in each status, across all subscribers. */
  getCounts(): Record<DeliveryStatus, number> {
    const counts: Record<DeliveryStatus, number> = {
      delivered: 0,
      retrying: 0,
      abandoned: 0,
    };
    for (const record of this.deliveries.values()) {
      counts[record.status]++;
    }
    return counts;
  }

  private async attempt(
    subscriber: Subscriber,
    id: string,
    subscriberId: string,
    event: unknown,
    attemptNumber: number
  ): Promise<DeliveryRecord> {
    const payload = JSON.stringify(event);
    const signature = createHmac("sha256", subscriber.secret).update(payload).digest("hex");

    try {
      await this.transport(subscriber.url, payload, signature);
      const record: DeliveryRecord = {
        id,
        subscriberId,
        event,
        attempts: attemptNumber,
        status: "delivered",
        nextDelayMs: null,
        lastError: null,
      };
      this.store(record);
      return record;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`webhook delivery to ${subscriber.url} failed: ${message}`, {
        secret: subscriber.secret,
      });

      const hasAttemptsLeft = attemptNumber < this.maxAttempts;
      const record: DeliveryRecord = {
        id,
        subscriberId,
        event,
        attempts: attemptNumber,
        status: hasAttemptsLeft ? "retrying" : "abandoned",
        nextDelayMs: hasAttemptsLeft ? this.baseDelayMs * 2 ** (attemptNumber - 1) : null,
        lastError: message,
      };
      this.store(record);
      return record;
    }
  }

  private store(record: DeliveryRecord): void {
    this.deliveries.set(record.id, record);
    const history = this.historyBySubscriber.get(record.subscriberId);
    if (history === undefined) {
      this.historyBySubscriber.set(record.subscriberId, [record.id]);
    } else if (!history.includes(record.id)) {
      history.push(record.id);
    }
  }
}
