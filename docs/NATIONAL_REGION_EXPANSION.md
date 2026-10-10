# Signalnow nationwide region rollout registry

## Current release gates

The client region registry intentionally separates geographic catalog entries from regions that may actually issue traffic-data requests.

| Region | Status | Data API code | Release rule |
| --- | --- | --- | --- |
| Seoul | Active | 1100000000 | Existing production path; protect with regression tests |
| Ulsan | Active | 3100000000 | Existing production path; protect with regression tests |
| Busan | Planned / disabled | 2600000000 | Do not enable until the upstream provider's coverage, schema, credentials, and real samples have been verified |

## Required before enabling a region

1. Verify official provider documentation and terms for intersection and signal-phase data.
2. Fetch real samples using server-side credentials; record provider, request fields, response fields, and sample timestamp.
3. Validate coordinate ranges, stable intersection IDs, duplicates, pagination, and no-data responses.
4. Add the region to the server-side allowlist only after a real end-to-end integration test succeeds.
5. Test map pins, region switching, search, nearest-intersection lookup, signal detail loading, stale-data behavior, and API failures.
6. Run type-check and production build; review deployment health before release.

## Safety invariants

- A region marked planned is disabled in the selector and cannot be selected by the UI.
- The server API allowlists remain the authority for data access; adding a catalog entry does not grant backend access.
- Do not synthesize signal states, phase countdowns, or intersection records when provider data is missing.
- Do not report a region as launched based on map center coordinates or a region name alone.
