interface Entry<T> {
  value: T;
  addedAt: number;
  pinned: boolean;
}

/**
 * Keeps a bounded set of entries alive until they age out, while letting
 * callers pin specific keys so a sweep leaves them untouched.
 */
export class RetentionSweeper<T> {
  private readonly entries = new Map<string, Entry<T>>();

  /**
   * Stores `value` under `key` with the given `addedAt` timestamp.
   * Re-adding an existing key updates its value and timestamp without
   * moving it in insertion order.
   */
  add(key: string, value: T, addedAt: number): void {
    const existing = this.entries.get(key);
    if (existing) {
      existing.value = value;
      existing.addedAt = addedAt;
      return;
    }

    this.entries.set(key, { value, addedAt, pinned: false });
  }

  /** Marks `key` as pinned. Returns false if the key is not present. */
  pin(key: string): boolean {
    const entry = this.entries.get(key);
    if (!entry) {
      return false;
    }

    entry.pinned = true;
    return true;
  }

  /** Clears the pin on `key`. Returns false if the key is not present. */
  unpin(key: string): boolean {
    const entry = this.entries.get(key);
    if (!entry) {
      return false;
    }

    entry.pinned = false;
    return true;
  }

  /**
   * Removes every entry added strictly before `cutoff` and returns the
   * removed keys in the order they were originally added.
   */
  sweep(cutoff: number): string[] {
    const removed: string[] = [];

    for (const [key, entry] of this.entries) {
      if (entry.addedAt < cutoff) {
        removed.push(key);
      }
    }

    for (const key of removed) {
      this.entries.delete(key);
    }

    return removed;
  }

  /** Returns the value stored for `key`, or `undefined` if it is not present. */
  get(key: string): T | undefined {
    return this.entries.get(key)?.value;
  }

  /** Returns whether `key` is currently present. */
  has(key: string): boolean {
    return this.entries.has(key);
  }

  /** Number of entries currently stored. */
  size(): number {
    return this.entries.size;
  }

  /** Returns all live keys in insertion order. */
  keys(): string[] {
    return [...this.entries.keys()];
  }
}
