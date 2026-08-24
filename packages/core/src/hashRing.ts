export function hashFunction(input: string): number {
  // FNV-1a base hash.
  let h = 0x811c9dc5;

  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }

  // MurmurHash3 finalization mix — dramatically improves avalanche.
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  h ^= h >>> 16;

  return h >>> 0;
}


export class RingNode {
  constructor(
    public readonly hash: number,
    public readonly nodeId: string
  ) {}
}

export class HashRing {
  private readonly virtualNodeCount: number;
  private readonly ring: RingNode[] = [];

  constructor(virtualNodeCount = 150) {
    this.virtualNodeCount = virtualNodeCount;
  }

  addNode(nodeId: string): void {
    for (let i = 0; i < this.virtualNodeCount; i++) {
      const hash = hashFunction(`${nodeId}#${i}`);
      const node = new RingNode(hash, nodeId);

      let low = 0;
      let high = this.ring.length;

      while (low < high) {
        const mid = Math.floor((low + high) / 2);

        if (this.ring[mid].hash < hash) {
          low = mid + 1;
        } else {
          high = mid;
        }
      }

      this.ring.splice(low, 0, node);
    }
  }

  removeNode(nodeId: string): void {
    const remaining = this.ring.filter(
      (node) => node.nodeId !== nodeId
    );

    this.ring.length = 0;
    this.ring.push(...remaining);
  }

  getNode(key: string): string {
    if (this.ring.length === 0) {
      throw new Error("Cannot route a key on an empty hash ring");
    }

    const keyHash = hashFunction(key);

    let low = 0;
    let high = this.ring.length;

    // Find the first virtual node whose hash >= keyHash.
    while (low < high) {
      const mid = Math.floor((low + high) / 2);

      if (this.ring[mid].hash < keyHash) {
        low = mid + 1;
      } else {
        high = mid;
      }
    }

    // Wrap around when keyHash is greater than every virtual node.
    if (low === this.ring.length) {
      return this.ring[0].nodeId;
    }

    return this.ring[low].nodeId;
  }

  getRingSnapshot(): RingNode[] {
    return [...this.ring];
  }
}