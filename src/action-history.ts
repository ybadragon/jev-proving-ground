/** How many actions an `ActionHistory` currently has available in each direction. */
export interface ActionHistoryCounts {
  readonly undoable: number;
  readonly redoable: number;
}

/**
 * An in-memory linear history of opaque actions, supporting undo and redo.
 *
 * The history does not know how to apply, execute, or reverse an action —
 * it only remembers the sequence of values it was given and hands them back
 * in the right order as the caller steps backward and forward through it.
 *
 * This history lives entirely in memory and tracks a single linear timeline:
 * there is no persistence and no branching redo path.
 */
export class ActionHistory<T = unknown> {
  private readonly past: T[] = [];
  private readonly future: T[] = [];

  /**
   * Records `action` as the newest entry in the history.
   *
   * This also invalidates any redo history built up by prior `undo()`
   * calls: once a new action is recorded, whatever had been undone before
   * it can no longer be brought back with `redo()`.
   */
  record(action: T): void {
    this.future.length = 0;
    this.past.push(action);
  }

  /**
   * Reverts the most recently recorded (or most recently redone) action,
   * returning it.
   *
   * Returns `undefined` and leaves the history unchanged if there is
   * nothing left to undo.
   */
  undo(): T | undefined {
    const action = this.past.pop();
    if (action === undefined) {
      return undefined;
    }
    this.future.push(action);
    return action;
  }

  /**
   * Reapplies the most recently undone action, returning it.
   *
   * Returns `undefined` and leaves the history unchanged if there is
   * nothing to redo.
   */
  redo(): T | undefined {
    const action = this.future.pop();
    if (action === undefined) {
      return undefined;
    }
    this.past.push(action);
    return action;
  }

  /** How many actions are currently available to undo and to redo. */
  counts(): ActionHistoryCounts {
    return { undoable: this.past.length, redoable: this.future.length };
  }
}
