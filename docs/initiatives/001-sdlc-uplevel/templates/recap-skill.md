# Drop-in file: `.claude/skills/recap/SKILL.md`

Copy this file to `.claude/skills/recap/SKILL.md` in each repo, then edit the
**Refresh list** section to name that repo's actual stale-state sources. The
frontmatter block below is required by Claude Code's skill loader.

---

```markdown
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

- The PR(s) this session opened or touched: current CI status on the **latest**
  commit, unresolved review threads, mergeability. (`gh pr view` / GitHub MCP.)
- Any jobs, deploys, or background tasks this session started: did they
  finish? What did they actually produce?
- **[EDIT PER REPO — the repo-specific truth sources, e.g.:]**
  - attune-coach app: is the deployed `version.json` SHA the commit you think
    shipped? Did the Vercel API pick up the same commit (`/api/version`)?
  - Waypoint: was the Apps Script deployment actually pushed, or only edited
    locally? Did the prompt-regression workflow pass?
  - LEGO-Sorter: does `pytest` pass on the current working tree right now?
- Any linked threads or documents the user pointed at earlier.

## Step 2 — Report exactly four things

1. **The goal, in the words of whoever asked.** Quote or closely paraphrase
   the original request — not your reformulation of it. If scope changed
   mid-session, quote the change too.
2. **Where things actually stand, and what the evidence is.** For every claim
   of "done", name the proof: a merged PR number, a deployed SHA verified
   live, a screenshot, a passing check on the latest commit. *Unit tests
   passing does not count as proven* — say what the tests do and don't cover.
   Distinguish "written" from "reviewed" from "merged" from "verified in
   production".
3. **What is blocked, split by kind.** Blocked on a **person** (waiting on
   Mike's approval, an expert reviewer, an external vendor) vs blocked on
   something **technical** (failing CI, missing credential, an API limit).
   Name the person or the failing thing specifically.
4. **Next steps, each marked with an owner.** A short list; every item tagged
   `[Claude]` or `[Mike]`. No unowned items.

Keep the whole recap under a screen. If a section is empty, say so in one
line rather than padding it.
```
