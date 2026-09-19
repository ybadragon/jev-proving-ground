/**
 * A fixed-size, in-memory cache that evicts the least recently used entry
 * once it is full.
 *
 * Recency is tracked per key: both reading a key and writing to an existing
 * key count as a "use" and move that key to the most-recently-used position.
 * Eviction only ever happens when a *new* key is added to a full cache.
 */
export class LRUCache<K, V> {
  private readonly capacity: number;
  // Map preserves insertion order, so re-inserting a key (delete + set)
  // is enough to track recency without a separate linked list.
  private readonly entries = new Map<K, V>();
  private missCount = 0;

  constructor(capacity: number) {
    if (!Number.isInteger(capacity) || capacity < 0) {
      throw new RangeError("capacity must be a non-negative integer");
    }
    this.capacity = capacity;
  }

  /** Number of entries currently stored. */
  get size(): number {
    return this.entries.size;
  }

  /** Number of times `get` was called for a key that was not present. */
  get misses(): number {
    return this.missCount;
  }

  /**
   * Returns whether `key` is currently present, without counting as a use:
   * it never refreshes recency and never increments `misses`. `get()` is not
   * a substitute for this check — calling it just to test membership would
   * protect the key from the next eviction as a side effect.
   */
  has(key: K): boolean {
    return this.entries.has(key);
  }

  /**
   * Returns the value stored for `key`, or `undefined` if it is not
   * present. A successful read counts as a use and refreshes the key's
   * recency; a failed read increments the miss count.
   */
  get(key: K): V | undefined {
    if (!this.entries.has(key)) {
      this.missCount++;
      return undefined;
    }

    const value = this.entries.get(key) as V;
    this.markAsUsed(key, value);
    return value;
  }

  /**
   * Stores `value` under `key`. Writing an existing key updates its value
   * and counts as a use. Writing a new key into a full cache evicts the
   * least recently used entry first. A cache with a capacity of zero never
   * stores anything.
   */
  set(key: K, value: V): void {
    if (this.capacity === 0) {
      return;
    }

    if (this.entries.has(key)) {
      this.markAsUsed(key, value);
      return;
    }

    if (this.entries.size >= this.capacity) {
      const leastRecentlyUsedKey = this.entries.keys().next().value as K;
      this.entries.delete(leastRecentlyUsedKey);
    }

    this.entries.set(key, value);
  }

  private markAsUsed(key: K, value: V): void {
    this.entries.delete(key);
    this.entries.set(key, value);
  }
}

// trivial comment to trigger a re-run
