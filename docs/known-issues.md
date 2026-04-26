# Known Issues

This file tracks accepted follow-up work and known limitations that are not blocking the current release.

## Matches Page Scalability

### Map Filter Builds From Full Match History

The map filter currently gathers its option list by paging through the full matches history. This works functionally, but response time will grow with total match volume.

TODO:
- Replace the full-history crawl with a dedicated map-list endpoint, or move to a lazy-loaded filter strategy.

Relevant code:
- `src/hooks/useMatches.ts`

### Per-Row Outcome Lookup Fans Out Stats Requests

Logged-in outcome highlighting currently performs one stats request per visible match row. This is acceptable at small scale, but it adds avoidable request fan-out on larger pages or slower connections.

TODO:
- Fold user outcome data into the main matches response, or batch the stats lookup for the visible page.

Relevant code:
- `src/hooks/useMatchUserOutcomes.ts`

## Release Notes

- Linux replay launch pathing was reviewed and found consistent with the existing launcher profile layout.
- No Linux-specific replay regression was identified in the current change set.