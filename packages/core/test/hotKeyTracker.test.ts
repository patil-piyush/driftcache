import { HotKeyTracker } from "../src/hotKeyTracker";

describe("HotKeyTracker", () => {
  let tracker: HotKeyTracker;

  beforeEach(() => {
    tracker = new HotKeyTracker({
      threshold: 5,
      windowMs: 5000,
      replicaCount: 2,
    });
  });

  afterEach(() => {
    tracker.stop();
  });

  it("flags a key as hot once it crosses the threshold", () => {
    expect(tracker.isHot("popular")).toBe(false);

    for (let i = 0; i < 5; i++) {
      tracker.recordAccess("popular");
    }

    expect(tracker.isHot("popular")).toBe(true);
  });

  it("does not flag keys below the threshold", () => {
    for (let i = 0; i < 4; i++) {
      tracker.recordAccess("warm");
    }

    expect(tracker.isHot("warm")).toBe(false);
  });

  it("tracks multiple keys independently", () => {
    for (let i = 0; i < 5; i++) {
      tracker.recordAccess("hot-key");
    }

    for (let i = 0; i < 3; i++) {
      tracker.recordAccess("cold-key");
    }

    expect(tracker.isHot("hot-key")).toBe(true);
    expect(tracker.isHot("cold-key")).toBe(false);
  });

  it("resetWindow clears all counters and hot-key flags", () => {
    for (let i = 0; i < 10; i++) {
      tracker.recordAccess("popular");
    }

    expect(tracker.isHot("popular")).toBe(true);

    tracker.resetWindow();

    expect(tracker.isHot("popular")).toBe(false);
    expect(tracker.getWindowSnapshot().size).toBe(0);
  });

  it("getWindowSnapshot returns current access counts", () => {
    tracker.recordAccess("a");
    tracker.recordAccess("a");
    tracker.recordAccess("b");

    const snapshot = tracker.getWindowSnapshot();

    expect(snapshot.get("a")).toBe(2);
    expect(snapshot.get("b")).toBe(1);
  });

  it("getHotKeys returns only keys above threshold", () => {
    for (let i = 0; i < 5; i++) {
      tracker.recordAccess("hot");
    }

    tracker.recordAccess("cold");

    const hotKeys = tracker.getHotKeys();

    expect(hotKeys.has("hot")).toBe(true);
    expect(hotKeys.has("cold")).toBe(false);
  });
});
