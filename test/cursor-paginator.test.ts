import assert from "node:assert/strict";
import { test } from "node:test";
import { SortedCursorPaginator } from "../src/cursor-paginator.js";

interface Item {
  key: number;
  label: string;
}

function byKey(a: Item, b: Item): number {
  return a.key - b.key;
}

function items(...pairs: Array<[number, string]>): Item[] {
  return pairs.map(([key, label]) => ({ key, label }));
}

test("the first page returns items in sorted order, capped at the page size", () => {
  const paginator = new SortedCursorPaginator(
    items([3, "c"], [1, "a"], [2, "b"], [5, "e"], [4, "d"]),
    byKey,
    2,
  );

  const page = paginator.getPage();

  assert.deepEqual(
    page.items.map((i) => i.key),
    [1, 2],
  );
});

test("presenting the returned cursor continues immediately after the previous page, without skipping or repeating", () => {
  const paginator = new SortedCursorPaginator(items([1, "a"], [2, "b"], [3, "c"], [4, "d"]), byKey, 2);

  const first = paginator.getPage();
  const second = paginator.getPage(first.nextCursor);

  assert.deepEqual(
    first.items.map((i) => i.key),
    [1, 2],
  );
  assert.deepEqual(
    second.items.map((i) => i.key),
    [3, 4],
  );
});

test("paging until no cursor is returned visits every item exactly once, in sorted order", () => {
  const source = items([5, "e"], [1, "a"], [4, "d"], [2, "b"], [3, "c"], [7, "g"], [6, "f"]);
  const paginator = new SortedCursorPaginator(source, byKey, 3);

  const seen: number[] = [];
  let cursor: string | null = null;
  do {
    const page = paginator.getPage(cursor);
    seen.push(...page.items.map((i) => i.key));
    cursor = page.nextCursor;
  } while (cursor !== null);

  assert.deepEqual(seen, [1, 2, 3, 4, 5, 6, 7]);
});

test("a page that reaches the end of the collection carries no further cursor", () => {
  const paginator = new SortedCursorPaginator(items([1, "a"], [2, "b"], [3, "c"], [4, "d"]), byKey, 2);

  const first = paginator.getPage();
  const second = paginator.getPage(first.nextCursor);

  assert.notEqual(first.nextCursor, null, "the collection has more items after the first page");
  assert.equal(second.nextCursor, null, "the second page reaches the end of the collection");
});

test("the first page of an empty collection is empty and carries no cursor", () => {
  const paginator = new SortedCursorPaginator<Item>([], byKey, 10);

  const page = paginator.getPage();

  assert.deepEqual(page.items, []);
  assert.equal(page.nextCursor, null);
});

test("a page size larger than the remaining items returns exactly what's left, with no cursor", () => {
  const paginator = new SortedCursorPaginator(items([1, "a"], [2, "b"], [3, "c"]), byKey, 10);

  const page = paginator.getPage();

  assert.deepEqual(
    page.items.map((i) => i.key),
    [1, 2, 3],
  );
  assert.equal(page.nextCursor, null);
});

test("items that tie under the sort order are each returned exactly once, in a stable order, even split across pages", () => {
  // Three items tie on key 2; a page size of 2 splits that tie group across
  // the first and second page.
  const source = items([1, "a"], [2, "first-tied"], [2, "second-tied"], [2, "third-tied"], [3, "z"]);
  const paginator = new SortedCursorPaginator(source, byKey, 2);

  const seenLabels: string[] = [];
  let cursor: string | null = null;
  do {
    const page = paginator.getPage(cursor);
    seenLabels.push(...page.items.map((i) => i.label));
    cursor = page.nextCursor;
  } while (cursor !== null);

  assert.deepEqual(seenLabels, ["a", "first-tied", "second-tied", "third-tied", "z"]);
});

test("constructing with a non-positive or non-integer page size throws", () => {
  assert.throws(() => new SortedCursorPaginator(items([1, "a"]), byKey, 0), RangeError);
  assert.throws(() => new SortedCursorPaginator(items([1, "a"]), byKey, -1), RangeError);
  assert.throws(() => new SortedCursorPaginator(items([1, "a"]), byKey, 1.5), RangeError);
});

test("presenting a cursor that did not come from this reader throws instead of returning an arbitrary page", () => {
  const paginator = new SortedCursorPaginator(items([1, "a"], [2, "b"]), byKey, 1);

  assert.throws(() => paginator.getPage("not-a-real-cursor"));
  assert.throws(() => paginator.getPage(""));
  assert.throws(() => paginator.getPage(Buffer.from("garbage").toString("base64")));
});
