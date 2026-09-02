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
`@types/jest@^29`, `@testing-library/react-native@^13`,
`better-sqlite3@~12.9.0` (tilde, not caret), and `jest-expo@~54.0.18` (the
version `expo@54`'s bundledNativeModules pins). Install these with explicit
version specs, not bare `npm install` / `expo install`, which resolve to
latest.

**Instead of:** Jest 30, RNTL 14, better-sqlite3 13 or `^12`.

**Because:** `jest-expo@54` and `react-native@0.81.5` both depend on Jest 29
internals (`babel-jest`, `jest-snapshot`, `@jest/globals`,
`jest-environment-*` at `^29`); a Jest 30 runner over Jest 29 internals gives
two copies of `expect` and transformer/snapshot interface mismatches. RNTL 14
drops `react-test-renderer` for a new `test-renderer@^1` peer that jest-expo 54
does not provide. For better-sqlite3, Node 20 imposes two ceilings: 13.x
declares `engines: node >= 22`, and within 12.x, 12.10.0 "remove[d] EOL builds
(Node.js v20, v23)" — 12.10.0+ publish no ABI 115 prebuild, so on Node 20 the
install script falls through `prebuild-install` to `node-gyp rebuild`, making
`npm ci` depend on a C++ toolchain and nodejs.org headers for a devDependency.
`~12.9.0` is the widest range admitting only prebuild-bearing releases (12.9.1
ships ABI 115 but was never published to npm).

**Revisit when:** The SDK pin moves off 54 (then re-derive the whole stack from
the new `jest-expo`), or CI and local dev move to Node 22. Node 20 went EOL in
April 2026 — which is exactly why upstream dropped its prebuilds — so moving to
Node 22 is the single change that unblocks better-sqlite3 12.10+ and 13, and
should widen this pin deliberately in its own issue rather than via
`npm update`.

**Amendment 2026-09-02 (issue #9) — Node 22; `better-sqlite3` widened to
`^13.0.3`:** CI (`.github/workflows/ci.yml`) and the devcontainer
(`.devcontainer/Dockerfile`) move from Node 20 to Node 22 LTS, and
`better-sqlite3` moves from `~12.9.0` to `^13.0.3`. Node 20 reached upstream
EOL on 2026-04-30, which is what the "Revisit when" above anticipated. The
tilde is dropped, not merely widened: `better-sqlite3@13` is N-API
(`NAPI_VERSION=10`), so it no longer downloads a per-Node-ABI prebuild via
`prebuild-install` at install time — the platform/arch binaries ship inside the
npm tarball (`prebuilds/linux-x64.node`). The failure mode the tilde guarded
against — a patch release dropping our ABI and silently falling through to a
source compile — is therefore gone, since no ABI-keyed asset remains to drop,
while the tilde would cost us the SQLite fixes upstream ships as patch
releases. One caveat found while implementing: 13.0.3 does declare
`gypfile: false`, but npm 10 ignores it — arborist reads that field from the
registry's abbreviated manifest, which omits it (npm/cli#9837) — and injects
`node-gyp rebuild` as an install script anyway. That run compiles nothing
(`binding.gyp` no-ops when a prebuild is present), but its configure step wants
Node headers, so `.devcontainer/Dockerfile` sets `npm_config_nodedir=/usr/local`
to use the headers `node:22` already ships rather than fetch from nodejs.org,
which the container firewall blocks. Net: `npm ci` now depends on python3 and
make (present in both `node:22` and `ubuntu-latest`) but never on a C++
compile. `@types/better-sqlite3` stays at `^9.6.0` (DefinitelyTyped latest;
better-sqlite3 ships no `.d.ts` of its own, so it is still required).
**Instead of (for this amendment):** `better-sqlite3@^12.11.1` on Node 22 — at
ABI 127 `prebuild-install` fetches the binary from GitHub release assets, which
is literally zero node-gyp, but leaves us off the current major and back on
ABI-keyed prebuilds — or blocking on npm/cli#9859 until it lands.
**Honestly:** this reinstates a lighter form of the exact headers/toolchain
dependency the original "Because" above avoided; accepted because the failure is
now loud (missing headers → node-gyp's configure step fails outright) rather than
a silent slow source compile, and because python3 and make are present in both
`node:22` and `ubuntu-latest`.
**Unchanged and still binding:** the Jest 29, `@types/jest` 29, RNTL 13,
`react-test-renderer` 19.1.0 and `jest-expo@~54.0.18` pins above — those are
coupled to `jest-expo@54`, not to the Node version, and nothing here revisits
them. **Revisit when:** as above, plus — npm/cli#9859 ("honor `gypfile: false` on
lockfile-driven installs") ships in the npm that Node 22 bundles, at which
point the `npm_config_nodedir` line comes out of the Dockerfile; Node 22 itself
goes EOL 2027-04-30 (Node 24 is the active LTS and was the alternative
considered; the N-API binary serves both, so the move is decoupled from this
pin), or `better-sqlite3@14` appears and the caret needs re-deriving.

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

**Amendment 2026-09-02 (issue #2) — the interface is async-only; the
better-sqlite3 driver is app code; transactions are explicit BEGIN/COMMIT:**
Implementing the above surfaced three tradeoffs the original entry did not
decide. (1) **Async-only interface.** `DbDriver` returns Promises from every
method, because `expo-sqlite@16`'s API is async (`openDatabaseAsync`,
`execAsync`, `runAsync`, `getAllAsync`, `withTransactionAsync`); better-sqlite3
is synchronous and its driver returns already-resolved Promises. Instead of a
sync interface with the expo driver blocking (impossible — its native calls are
genuinely async) or two interface shapes. The cost is that Node tests `await`
things that never yield, which reads slightly false. (2) **The better-sqlite3
driver lives in `src/db/betterSqliteDriver.ts`, owned by lead-programmer**, not
in `src/__tests__/` owned by test-programmer. It implements an app-defined
contract and must stay in lockstep with the expo driver on details that are
contract rather than scaffolding — better-sqlite3 returns `lastInsertRowid`
where expo-sqlite returns `lastInsertRowId`, and the driver normalises it.
Putting it in the test lane would force test-programmer to edit contract code
on every interface change. It stays out of the bundle because nothing reachable
from `index.ts`/`App.tsx` imports it; `npm run export:check` plus a
`grep -ri better-sqlite3 dist/` is the mechanical proof, and that check is a
release-gate item, not a convention. (3) **Transactions use explicit
`BEGIN`/`COMMIT`/`ROLLBACK` via `exec` in both drivers**, not
better-sqlite3's `db.transaction()` helper: verified in 13.0.3, that helper
throws `Transaction function cannot return a promise` when handed an async
function, so it cannot honour an async interface at all. Explicit statements are
also exactly what `expo-sqlite`'s `withTransactionAsync` does internally, so the
two drivers get identical semantics instead of merely similar ones. Given up:
better-sqlite3's automatic savepoint nesting — nested transactions are
unsupported in both drivers and throw from SQLite.
**Revisit when:** as above, plus — `expo-sqlite` gains a stable sync API worth
using on device (its `execSync`/`runSync` exist but block the JS thread), or a
third driver appears (e.g. `node:sqlite`, which would let tests drop the
better-sqlite3 devDependency and its native addon entirely — worth checking once
it is out of Node's experimental status).
