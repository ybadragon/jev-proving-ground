/**
 * A fixed-capacity leaderboard that keeps only the best scores submitted so
 * far.
 *
 * Entries are tracked independently and keyed by an arbitrary string id: the
 * same id may be submitted more than once, producing a fresh, independent
 * entry each time. While the board has not yet reached capacity, every
 * submitted score is kept. Once it is full, a new score only displaces the
 * current lowest entry when it actually beats that entry; a tie leaves the
 * board exactly as it was, so the longest-standing entry keeps its place
 * until something strictly better comes along.
 */
export class Leaderboard {
  private readonly capacity: number;
  private readonly entries: Entry[] = [];
  private nextSeq = 0;

  constructor(capacity: number) {
    if (!Number.isInteger(capacity) || capacity <= 0) {
      throw new RangeError('capacity must be a positive integer');
    }
    this.capacity = capacity;
  }

  /**
   * Submit a score for `id`. Returns true if the score was added to the
   * board (either because there was room, or because it displaced the
   * current lowest entry), or false if it was rejected.
   */
  submit(id: string, score: number): boolean {
    const entry: Entry = { id, score, seq: this.nextSeq++ };

    if (this.entries.length < this.capacity) {
      this.entries.push(entry);
      return true;
    }

    const lowestIndex = this.findLowestIndex();
    const lowest = this.entries[lowestIndex];

    if (score > lowest.score) {
      this.entries[lowestIndex] = entry;
      return true;
    }

    return false;
  }

  /**
   * The current entries, ordered from highest score to lowest. Entries tied
   * on score are ordered by submission order, earliest first.
   */
  top(): Array<{ id: string; score: number }> {
    return [...this.entries]
      .sort((a, b) => b.score - a.score || a.seq - b.seq)
      .map(({ id, score }) => ({ id, score }));
  }

  /** The number of entries currently on the board. */
  size(): number {
    return this.entries.length;
  }

  private findLowestIndex(): number {
    let lowestIndex = 0;
    for (let i = 1; i < this.entries.length; i++) {
      const candidate = this.entries[i];
      const current = this.entries[lowestIndex];
      const candidateIsLower =
        candidate.score < current.score ||
        (candidate.score === current.score && candidate.seq < current.seq);
      if (candidateIsLower) {
        lowestIndex = i;
      }
    }
    return lowestIndex;
  }
}

interface Entry {
  id: string;
  score: number;
  seq: number;
}
