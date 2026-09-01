# Changelog

All notable changes to this project will be documented in this file.

## [0.1.0] — 2026-09-01

### Added
- **Consistent hash ring** with MurmurHash3 finalization mix and 150 virtual nodes per shard.
- **L1/L2 tiered caching**: in-memory LRU (L1) with configurable size + Redis (L2).
- **Pub/sub invalidation**: cross-instance L1 eviction via Redis pub/sub. Self-published messages are filtered out using per-instance IDs.
- **Health checker**: ping-based shard monitoring with automatic ring removal/re-addition on failure/recovery.
- **Hot-key tracker**: sliding window access counter that replicates hot values to neighboring shards.
- **Metrics**: hit/miss ratios (L1 vs L2), latency percentiles (p50/p95/p99), shard distribution tracking.
- **HTTP proxy server** (`@driftcache/proxy`): REST API (`GET/PUT/DELETE /cache/:key`, `/metrics`, `/health`).
- **CLI** (`npx driftcache start`): starts the proxy with shard configuration via flags or JSON config file.
- **React dashboard** (`@driftcache/dashboard`): Vite + recharts monitoring UI with real-time polling.
- **60 tests** total: 47 unit tests (mocked Redis) + 13 live integration tests (real Redis via Docker).
- **Automated test scripts**: `scripts/failover-test.js` (shard stop/start/recovery) and `scripts/hotkey-test.js` (Zipfian load test).

### Fixed
- Self-invalidation bug: `set()` was evicting its own L1 entry via the pub/sub round-trip.
- Express v5 `req.params` type incompatibility in proxy routes.
- Missing `destroyShardClients()` cleanup function for proper connection teardown.
