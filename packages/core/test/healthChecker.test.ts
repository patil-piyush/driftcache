import { HealthChecker, ShardStatusEvent } from "../src/healthChecker";
import { HashRing } from "../src/hashRing";
import * as shardClient from "../src/shardClient";

// Mock pingShard so we don't need real Redis connections.
jest.mock("../src/shardClient", () => ({
  ...jest.requireActual("../src/shardClient"),
  pingShard: jest.fn(),
}));

const mockedPingShard = shardClient.pingShard as jest.MockedFunction<
  typeof shardClient.pingShard
>;

describe("HealthChecker", () => {
  let ring: HashRing;
  let checker: HealthChecker;

  beforeEach(() => {
    ring = new HashRing(10);
    ring.addNode("shard-1");
    ring.addNode("shard-2");
    ring.addNode("shard-3");

    checker = new HealthChecker({
      intervalMs: 1000,
      failureThreshold: 3,
      shardIds: ["shard-1", "shard-2", "shard-3"],
      hashRing: ring,
    });

    mockedPingShard.mockReset();
  });

  afterEach(() => {
    checker.stopHealthChecks();
  });

  it("does not mark a shard down on a single failure", () => {
    checker.evaluateShardHealth("shard-1", false);

    expect(checker.getStatus().get("shard-1")).toBe("up");
    // Ring should still contain shard-1.
    expect(
      ring
        .getRingSnapshot()
        .some((n) => n.nodeId === "shard-1")
    ).toBe(true);
  });

  it("marks a shard down after consecutive failures reach the threshold", () => {
    const events: ShardStatusEvent[] = [];
    checker.onStatusChange((e) => events.push(e));

    checker.evaluateShardHealth("shard-1", false);
    checker.evaluateShardHealth("shard-1", false);
    checker.evaluateShardHealth("shard-1", false);

    expect(checker.getStatus().get("shard-1")).toBe("down");

    // Ring should no longer contain shard-1.
    expect(
      ring
        .getRingSnapshot()
        .some((n) => n.nodeId === "shard-1")
    ).toBe(false);

    // Should have emitted exactly one shardDown event.
    expect(events).toHaveLength(1);
    expect(events[0].shardId).toBe("shard-1");
    expect(events[0].status).toBe("down");
  });

  it("does not emit duplicate down events for already-down shards", () => {
    const events: ShardStatusEvent[] = [];
    checker.onStatusChange((e) => events.push(e));

    for (let i = 0; i < 6; i++) {
      checker.evaluateShardHealth("shard-1", false);
    }

    // Only one event even though threshold was crossed twice.
    expect(events).toHaveLength(1);
  });

  it("resets the failure counter on a successful ping", () => {
    checker.evaluateShardHealth("shard-1", false);
    checker.evaluateShardHealth("shard-1", false);
    // One success resets the counter.
    checker.evaluateShardHealth("shard-1", true);
    // Now two more failures — still below threshold of 3.
    checker.evaluateShardHealth("shard-1", false);
    checker.evaluateShardHealth("shard-1", false);

    expect(checker.getStatus().get("shard-1")).toBe("up");
  });

  it("recovers a downed shard when it starts responding again", () => {
    const events: ShardStatusEvent[] = [];
    checker.onStatusChange((e) => events.push(e));

    // Take shard down.
    checker.evaluateShardHealth("shard-2", false);
    checker.evaluateShardHealth("shard-2", false);
    checker.evaluateShardHealth("shard-2", false);

    expect(checker.getStatus().get("shard-2")).toBe("down");

    // Bring it back.
    checker.evaluateShardHealth("shard-2", true);

    expect(checker.getStatus().get("shard-2")).toBe("up");

    // Ring should have shard-2 again.
    expect(
      ring
        .getRingSnapshot()
        .some((n) => n.nodeId === "shard-2")
    ).toBe(true);

    // Two events: one down, one up.
    expect(events).toHaveLength(2);
    expect(events[1].status).toBe("up");
  });

  it("runs checks using pingShard", async () => {
    mockedPingShard.mockResolvedValue(true);

    await checker.runChecks();

    expect(mockedPingShard).toHaveBeenCalledTimes(3);
    expect(checker.getStatus().get("shard-1")).toBe("up");
    expect(checker.getStatus().get("shard-2")).toBe("up");
    expect(checker.getStatus().get("shard-3")).toBe("up");
  });

  it("handles pingShard returning false in runChecks", async () => {
    mockedPingShard.mockImplementation(async (shardId: string) => {
      return shardId !== "shard-1";
    });

    // Run checks 3 times to cross the threshold for shard-1.
    await checker.runChecks();
    await checker.runChecks();
    await checker.runChecks();

    expect(checker.getStatus().get("shard-1")).toBe("down");
    expect(checker.getStatus().get("shard-2")).toBe("up");
    expect(checker.getStatus().get("shard-3")).toBe("up");
  });
});
