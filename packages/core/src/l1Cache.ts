interface L1Node {
  key: string;
  value: unknown;
  expiresAt: number;
  prev: L1Node | null;
  next: L1Node | null;
}

export interface L1CacheOptions {
  maxSize: number;
}

export class L1Cache {
  private readonly maxSize: number;
  private readonly cache = new Map<string, L1Node>();

  private head: L1Node | null = null;
  private tail: L1Node | null = null;

  constructor(options: L1CacheOptions) {
    if (options.maxSize <= 0) {
      throw new Error("L1 cache maxSize must be greater than 0");
    }

    this.maxSize = options.maxSize;
  }

  l1Get(key: string): unknown | undefined {
    const node = this.cache.get(key);

    if (!node) {
      return undefined;
    }

    if (node.expiresAt <= Date.now()) {
      this.removeNode(node);
      this.cache.delete(key);
      return undefined;
    }

    this.moveToFront(node);

    return node.value;
  }

  l1Set(
    key: string,
    value: unknown,
    ttlSeconds: number
  ): void {
    if (ttlSeconds <= 0) {
      this.l1Delete(key);
      return;
    }

    const expiresAt = Date.now() + ttlSeconds * 1000;
    const existing = this.cache.get(key);

    if (existing) {
      existing.value = value;
      existing.expiresAt = expiresAt;

      this.moveToFront(existing);

      return;
    }

    const node: L1Node = {
      key,
      value,
      expiresAt,
      prev: null,
      next: null,
    };

    this.cache.set(key, node);
    this.addToFront(node);

    if (this.cache.size > this.maxSize) {
      this.evictLeastRecentlyUsed();
    }
  }

  l1Delete(key: string): void {
    const node = this.cache.get(key);

    if (!node) {
      return;
    }

    this.removeNode(node);
    this.cache.delete(key);
  }

  l1Clear(): void {
    this.cache.clear();
    this.head = null;
    this.tail = null;
  }

  private addToFront(node: L1Node): void {
    node.prev = null;
    node.next = this.head;

    if (this.head) {
      this.head.prev = node;
    } else {
      this.tail = node;
    }

    this.head = node;
  }

  private removeNode(node: L1Node): void {
    if (node.prev) {
      node.prev.next = node.next;
    } else {
      this.head = node.next;
    }

    if (node.next) {
      node.next.prev = node.prev;
    } else {
      this.tail = node.prev;
    }

    node.prev = null;
    node.next = null;
  }

  private moveToFront(node: L1Node): void {
    if (node === this.head) {
      return;
    }

    this.removeNode(node);
    this.addToFront(node);
  }

  private evictLeastRecentlyUsed(): void {
    if (!this.tail) {
      return;
    }

    const node = this.tail;

    this.removeNode(node);
    this.cache.delete(node.key);
  }
}