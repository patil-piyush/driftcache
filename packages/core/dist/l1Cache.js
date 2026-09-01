"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.L1Cache = void 0;
class L1Cache {
    maxSize;
    cache = new Map();
    head = null;
    tail = null;
    constructor(options) {
        if (options.maxSize <= 0) {
            throw new Error("L1 cache maxSize must be greater than 0");
        }
        this.maxSize = options.maxSize;
    }
    l1Get(key) {
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
    l1Set(key, value, ttlSeconds) {
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
        const node = {
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
    l1Delete(key) {
        const node = this.cache.get(key);
        if (!node) {
            return;
        }
        this.removeNode(node);
        this.cache.delete(key);
    }
    l1Clear() {
        this.cache.clear();
        this.head = null;
        this.tail = null;
    }
    addToFront(node) {
        node.prev = null;
        node.next = this.head;
        if (this.head) {
            this.head.prev = node;
        }
        else {
            this.tail = node;
        }
        this.head = node;
    }
    removeNode(node) {
        if (node.prev) {
            node.prev.next = node.next;
        }
        else {
            this.head = node.next;
        }
        if (node.next) {
            node.next.prev = node.prev;
        }
        else {
            this.tail = node.prev;
        }
        node.prev = null;
        node.next = null;
    }
    moveToFront(node) {
        if (node === this.head) {
            return;
        }
        this.removeNode(node);
        this.addToFront(node);
    }
    evictLeastRecentlyUsed() {
        if (!this.tail) {
            return;
        }
        const node = this.tail;
        this.removeNode(node);
        this.cache.delete(node.key);
    }
}
exports.L1Cache = L1Cache;
//# sourceMappingURL=l1Cache.js.map