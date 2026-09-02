# Decisions

Dated log of real tradeoffs: what was chosen, what was given up, and what
would trigger revisiting. Newest first. Proposed by any agent, owned by
the architect, merged via PR.

Format:

```
## YYYY-MM-DD — Short title
**Decision:**
**Instead of:**
**Because:**
**Revisit when:**
```

---

## 2026-09-02 — Test stack pinned to Jest 29 / RNTL 13 / better-sqlite3 12

**Decision:** The test toolchain is pinned below latest: `jest@~29.7.0` +
`@types/jest@^29`, `@testing-library/react-native@^13`, `better-sqlite3@^12`,
and `jest-expo@~54.0.18` (the version `expo@54`'s bundledNativeModules pins).
Install these with explicit version specs, not bare `npm install` / `expo
install`, which resolve to latest.

**Instead of:** Jest 30, RNTL 14, better-sqlite3 13.

**Because:** `jest-expo@54` and `react-native@0.81.5` both depend on Jest 29
internals (`babel-jest`, `jest-snapshot`, `@jest/globals`,
`jest-environment-*` at `^29`); a Jest 30 runner over Jest 29 internals gives
two copies of `expect` and transformer/snapshot interface mismatches. RNTL 14
drops `react-test-renderer` for a new `test-renderer@^1` peer that jest-expo 54
does not provide. `better-sqlite3@13` declares `engines: node >= 22` while
local dev and CI run Node 20.

**Revisit when:** The SDK pin moves off 54 (then re-derive the whole stack from
the new `jest-expo`), or CI and local dev move to Node 22 (unblocks
better-sqlite3 13).

## 2026-09-02 — Pin to Expo SDK 54 / Expo Go; no dev builds

**Decision:** The project targets Expo SDK 54 and runs exclusively in the
App Store build of Expo Go. No SDK upgrades, no libraries with native code
outside Expo Go's built-in set, no EAS/dev-client builds.

**Instead of:** Latest SDK (57) with a custom development build.

**Because:** Development happens on Windows with an iPhone — no Mac. The
App Store version of Expo Go is currently pinned at SDK 54 (newer Expo Go
releases are stalled in Apple review), and a dev build would require an
Apple Developer account plus cloud builds for zero feature gain: the app
is JS-only by design.

**Revisit when:** The App Store Expo Go advances past SDK 54 (upgrade via
`npx expo install expo@^<n> --fix`), or a genuinely required native
capability appears (then: EAS dev build, one-time cost).

## 2026-09-02 — No backend; SQLite + direct Open Food Facts calls

**Decision:** All data lives on-device in SQLite. The phone calls the
Open Food Facts API directly, cache-first, with a descriptive User-Agent.
No server, no accounts, no push.

**Instead of:** A hosted API (own server or Supabase) fronting OFF with a
shared cache.

**Because:** The product stance is a $few, no-account, no-nag utility —
nothing in v1 needs cross-device state. A backend adds deploys, secrets,
and cost for one developer with no server-side requirements. Per-device
caching keeps OFF usage far under their public rate limits.

**Revisit when:** A feature needs shared or server-side state (price
sourcing via retailer APIs with secret keys, cross-device sync), at which
point the minimum is a single edge function holding the secret — not a
full backend.

## 2026-09-02 — Multi-agent workflow with hard file-ownership lanes

**Decision:** Work is produced by role-separated subagents (architect /
lead-programmer / test-programmer / code-auditor / code-reviewer) with
absolute file-ownership lanes, orchestrated per CLAUDE.md; one PR in
flight at a time; human is sole approver and merger.

**Instead of:** A single agent writing code and tests together, or
parallel PRs.

**Because:** The repo is equal parts app and demonstration of an
agentic-engineering workflow. Separating code-writing from test-writing
keeps tests adversarial rather than self-confirming; the WIP limit keeps
every review small enough to actually perform (150–300 line target).

**Revisit when:** The overhead visibly exceeds the value on small issues
(possible outcome: a documented "trivial change" fast path), or lane
violations stop occurring for long enough that enforcement can relax.

## 2026-09-02 — Dual SQLite drivers: expo-sqlite in app, better-sqlite3 in tests

**Decision:** Database access goes through a thin driver interface with
two implementations: expo-sqlite in the app, better-sqlite3 (devDependency)
in Node-side tests. (Established here; implemented in issue #2.)

**Instead of:** Mocking the database in tests, or running tests only
against expo-sqlite.

**Because:** expo-sqlite cannot run in Node, so headless data-layer tests
need a real SQLite to be worth anything — mocks would test the mocks. Same
pattern as the author's prior project (LineCheck), where it proved out.

**Revisit when:** Driver behavior diverges in practice (SQL dialect or
transaction semantics differences between the two SQLite bindings showing
up as passing-tests-failing-app), which would force integration checks on
device.