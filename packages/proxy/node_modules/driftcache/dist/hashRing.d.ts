export declare function hashFunction(input: string): number;
export declare class RingNode {
    readonly hash: number;
    readonly nodeId: string;
    constructor(hash: number, nodeId: string);
}
export declare class HashRing {
    private readonly virtualNodeCount;
    private readonly ring;
    constructor(virtualNodeCount?: number);
    addNode(nodeId: string): void;
    removeNode(nodeId: string): void;
    getNode(key: string): string;
    getRingSnapshot(): RingNode[];
}
//# sourceMappingURL=hashRing.d.ts.map