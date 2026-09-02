## What changed

<!-- 2-5 sentences. What this PR does and the shape of the approach.
     Link the plan: docs/plans/<issue>-<slug>.md -->

## How to verify

<!-- Exact steps a human takes, starting from `npx expo start`.
     e.g.:
     1. npx expo start, scan QR with Expo Go
     2. Point camera at any UPC (cereal box works)
     3. Expect: decoded string appears; scanning the same box again
        within 2s does NOT fire twice
     For logic-only PRs: name the test files that prove the behavior. -->

## What I'm unsure about

<!-- Honest, specific, 2-5 bullets aggregated from all agents. This is
     where the human looks first. "Nothing" is almost never true. -->

## Gate

- [ ] `npm run typecheck` green
- [ ] `npx jest` green
- [ ] `npm run export:check` green
- [ ] Auditor pass complete (findings resolved or noted above)
- [ ] Lane check: every commit's diff within its agent's lane
- [ ] Size: reviewable diff ≤ ~400 lines (lockfile/fixtures excluded)
- [ ] DECISIONS.md updated if a real tradeoff was made

Closes #