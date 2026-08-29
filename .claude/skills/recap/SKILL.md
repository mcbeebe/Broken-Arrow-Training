---
name: recap
description: Report where this session's work actually stands — goal, status with evidence, blockers, and next steps. Use when the user asks "where are we", "status", "recap", or returns to a session after time away. Never starts new work.
---

# /recap — where do things actually stand?

You are reporting state, not making progress. **Starting any new work during a
recap is forbidden** — no edits, no commits, no new subagents, no "while I'm
here" fixes. If you notice something broken, it goes in the report as a next
step.

## Step 1 — Refresh anything that might be stale (spend a minute or two)

Do not report from memory; conversation context rots while work runs
elsewhere. Re-check, in this order:

- **The PR(s) this session opened or touched** — CI status on the *latest*
  commit, unresolved review threads, mergeability.
- **Any background jobs this session started** — did they finish, and what did
  they actually produce?
- **What is live, if a deploy happened.** Three SHAs have to agree, and they
  come from three independent systems:
  - `https://attune.coach/version.json` — what GitHub Pages is serving
  - `$VITE_GARMIN_API_URL/api/version` — what Vercel built the API from
  - the commit you believe shipped
  A mismatch is the normal failure, not an exception: the Pages publish and
  the Vercel API deploy are separate pipelines and either can lag or fail
  silently. Say which one is behind.
- **Anything the user linked earlier** in the session.

## Step 2 — Report exactly four things

1. **The goal, in the words of whoever asked.** Quote or closely paraphrase
   the original request — not your reformulation. If scope changed mid-session,
   quote the change too.
2. **Where things actually stand, and what the evidence is.** For every claim
   of "done", name the proof: a merged PR number, a SHA verified live, a
   passing check on the latest commit. *Unit tests passing does not count as
   proven* — this repo's own eval harness makes the distinction (fixture
   honesty proves a fixture tests what it claims; only a live report-card run
   proves coach behavior). Distinguish written / reviewed / merged / verified
   in production.
3. **What is blocked, split by kind.** Blocked on a **person** (waiting on
   Mike's approval, an expert reviewer, an App Store review) versus blocked on
   something **technical** (a failing check, a missing secret, a plan limit).
   Name the person or the failing thing specifically.
4. **Next steps, each with an owner.** A short list; every item tagged
   `[Claude]` or `[Mike]`. No unowned items.

Keep the whole recap under a screen. If a section is empty, say so in one line
rather than padding it.
