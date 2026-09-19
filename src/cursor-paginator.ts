/**
 * Reads a fixed snapshot of a sorted collection back in fixed-size pages,
 * using an opaque cursor token so callers never deal with raw offsets.
 *
 * The collection is sorted once, up front, using the comparator supplied at
 * construction time. Paging through it repeatedly (start with no cursor,
 * then keep feeding back the `nextCursor` from the previous page) visits
 * every item exactly once, in sorted order, including items that tie under
 * the comparator.
 */

export interface CursorPage<T> {
  readonly items: readonly T[];
  readonly nextCursor: string | null;
}

const CURSOR_MARKER = "scp1:";

export class SortedCursorPaginator<T> {
  private readonly sorted: readonly T[];
  private readonly pageSize: number;

  constructor(items: readonly T[], compare: (a: T, b: T) => number, pageSize: number) {
    if (!Number.isInteger(pageSize) || pageSize <= 0) {
      throw new RangeError("pageSize must be a positive integer");
    }
    this.sorted = [...items].sort(compare);
    this.pageSize = pageSize;
  }

  /**
   * Returns the next page. Pass no cursor (or `null`) to get the first page;
   * pass the `nextCursor` from a previous page to continue after it.
   */
  getPage(cursor: string | null = null): CursorPage<T> {
    const start = cursor === null ? 0 : this.decodeCursor(cursor);
    const end = Math.min(start + this.pageSize, this.sorted.length);
    const items = this.sorted.slice(start, end);
    const nextCursor = end < this.sorted.length ? this.encodeCursor(end - 1) : null;
    return { items, nextCursor };
  }

  private encodeCursor(nextIndex: number): string {
    return CURSOR_MARKER + Buffer.from(String(nextIndex), "utf8").toString("base64");
  }

  private decodeCursor(cursor: string): number {
    if (!cursor.startsWith(CURSOR_MARKER)) {
      throw new Error("invalid cursor");
    }

    const encoded = cursor.slice(CURSOR_MARKER.length);
    let decoded: string;
    try {
      decoded = Buffer.from(encoded, "base64").toString("utf8");
    } catch {
      throw new Error("invalid cursor");
    }

    const index = Number(decoded);
    if (!Number.isInteger(index) || index < 0 || index > this.sorted.length) {
      throw new Error("invalid cursor");
    }
    return index;
  }
}
