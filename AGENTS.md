# AGENTS.md — instructions for any AI coding agent (Claude Code, Codex, Cursor, Copilot)

The canonical project instructions are in [`CLAUDE.md`](CLAUDE.md). The same rules apply to every agent.
This file adds how multi-agent work is organised in this repo.

## Roles
- **Orchestrator**: plans, writes task briefs in `tasks/`, reviews diffs, merges, runs the full test suite, updates Jira.
- **Worker**: implements exactly one brief in its own git worktree and branch (`feature/NC-1-<name>`).
- **Reviewer**: an independent agent that has not seen the implementation. It reviews the PR diff against `spec.md` and the
  assignment, and its output is labelled as an AI review.

## Worker rules
1. Read `tasks/<your-name>.md`, `spec.md` and `CLAUDE.md` first.
2. Edit **only** the files listed as owned in your brief. If you need a change elsewhere, stop and write it under
   "Requests to orchestrator" at the bottom of your brief. Do not make the change yourself.
3. Code against the contracts in `spec.md` (§3 data model, §4 API, §4.4 dashboard JSON). Do not change them.
4. Write tests for your module. Run `npm test` before every commit and paste the real summary line into your final message.
5. Commit small steps with the message `NC-<n> <type>: <summary>`. Do not push, merge, rebase other branches,
   or touch Jira or GitHub.
6. When done, end with a short report: what you built, test output, known gaps, and anything you were unsure about.

## Definition of done (every task)
- Behaviour matches the spec and the brief. No extra mechanics.
- `npm test` passes in your worktree, and the real output is reported.
- No files outside your ownership list have changed (`git diff --stat` is clean outside it).
