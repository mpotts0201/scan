# /next — pick up the next issue and take it to draft PR

You are the orchestrator. Execute this procedure exactly. One issue, then
stop.

## 1. WIP limit check (hard gate — do this before anything else)

Run `gh pr list --state open` (all PRs, draft included).

- **A PR is open and has unaddressed human review comments** → do not start
  new work. Execute CLAUDE.md step 9 (fetch inline diff comments, review
  summaries, AND conversation comments — three different endpoints), route
  fixes by lane, re-run the gate, push to the same branch, reply in-thread.
  Then stop.
- **A PR is open with no new human feedback** → report "PR #<n> is awaiting
  your review" and stop. Do not start new work. Do not interpret silence
  as approval.
- **No open PRs** → proceed.

Exception: none by default. Parallel work happens only if the human
explicitly says so in this session, naming the issue to run in parallel.

## 2. Select the issue

Run `gh issue list --state open` and read the candidates.

- Pick the **lowest-numbered** open issue whose "Depends on" issues are all
  closed. Do not skip ahead to a more interesting issue.
- If its dependencies aren't closed, or no issue is workable, report why
  and stop.
- If the issue is ambiguous or its acceptance criteria conflict with
  CLAUDE.md hard constraints, ask the human before starting — do not
  resolve product ambiguity by assumption.

## 3. Execute the CLAUDE.md workflow

Branch from freshly-pulled main (`git checkout main && git pull && git
checkout -b feat/<issue>-<slug>`). Never branch from another feature
branch.

Then run the standard pipeline: architect plan → lead-programmer →
test-programmer → gate (typecheck, jest, export:check) → code-auditor →
code-reviewer (fix MUSTs, re-gate) — all per CLAUDE.md, lanes enforced,
out-of-lane diffs reverted.

## 4. Size guard (before opening the PR)

Run `git diff main...HEAD --shortstat` and also compute reviewable lines:
exclude `package-lock.json`, `src/__tests__/fixtures/**`, and generated
files.

- Reviewable lines ≤ ~400 → proceed. (150–300 is the target; small is
  good; do not pad.)
- Over ~400 → **do not open the PR.** Report to the human with a proposed
  split into sequential issues (what ships first, what moves to a
  follow-up) and stop. Splitting is a normal outcome, not a failure.

## 5. Open the draft PR

- `gh pr create --draft` using the repo PR template. Fill "How to verify"
  with exact Expo Go steps and "What I'm unsure about" with the agents'
  aggregated honest uncertainties. Body includes `Closes #<issue>`.
- Publish the code-reviewer's findings as an inline review per CLAUDE.md
  step 7 (review JSON via `gh api`, event COMMENT, severity-prefixed
  line comments; unanchorable findings go in the review body; delete the
  JSON file after posting, never commit it).
- Mark the PR ready for review (`gh pr ready`) only if the full gate is
  green; otherwise leave it draft and report what's failing.

## 6. Stop

Report: issue number, PR number, reviewable line count, gate status, and
the top item from "What I'm unsure about." Then end. Do not pick up
another issue. Do not continue working "while waiting." The human reviews
next.