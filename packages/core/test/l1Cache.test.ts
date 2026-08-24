import { L1Cache } from "../src/l1Cache";

beforeEach(() => {
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
});

describe("L1Cache", () => {
  it("returns undefined for a missing key", () => {
    const cache = new L1Cache({ maxSize: 2 });

    expect(cache.l1Get("missing")).toBeUndefined();
  });

  it("stores and retrieves values", () => {
    const cache = new L1Cache({ maxSize: 2 });

    cache.l1Set("key", { value: 123 }, 60);

    expect(cache.l1Get("key")).toEqual({ value: 123 });
  });

  it("updates an existing key", () => {
    const cache = new L1Cache({ maxSize: 2 });

    cache.l1Set("key", "old", 60);
    cache.l1Set("key", "new", 60);

    expect(cache.l1Get("key")).toBe("new");
  });

  it("evicts the least recently used key", () => {
    const cache = new L1Cache({ maxSize: 2 });

    cache.l1Set("a", "A", 60);
    cache.l1Set("b", "B", 60);

    // Make "a" the most recently used.
    expect(cache.l1Get("a")).toBe("A");

    // "b" should now be the LRU entry.
    cache.l1Set("c", "C", 60);

    expect(cache.l1Get("a")).toBe("A");
    expect(cache.l1Get("b")).toBeUndefined();
    expect(cache.l1Get("c")).toBe("C");
  });

  it("expires entries based on TTL", () => {
    const cache = new L1Cache({ maxSize: 2 });

    cache.l1Set("key", "value", 1);

    expect(cache.l1Get("key")).toBe("value");

    jest.advanceTimersByTime(1001);

    expect(cache.l1Get("key")).toBeUndefined();
  });

  it("deletes an entry", () => {
    const cache = new L1Cache({ maxSize: 2 });

    cache.l1Set("key", "value", 60);
    cache.l1Delete("key");

    expect(cache.l1Get("key")).toBeUndefined();
  });

  it("clear removes everything", () => {
    const cache = new L1Cache({ maxSize: 2 });

    cache.l1Set("a", "A", 60);
    cache.l1Set("b", "B", 60);

    cache.l1Clear();

    expect(cache.l1Get("a")).toBeUndefined();
    expect(cache.l1Get("b")).toBeUndefined();
  });

  it("rejects an invalid capacity", () => {
    expect(() => new L1Cache({ maxSize: 0 })).toThrow();
  });
});