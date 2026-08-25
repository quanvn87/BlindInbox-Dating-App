# Neutral Documentation Naming Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publish conventional documentation names with no tracked AI-tool operational state.

**Architecture:** Rename the tracked documentation tree to `docs/project/` and rewrite references. Preserve the ignored `.superpowers/` directory locally; it is never staged or pushed.

**Tech Stack:** Git, PowerShell, Markdown.

## Global Constraints

- Preserve all existing specifications and plans.
- Do not change application source, dependencies, environment files, or database assets.
- Preserve `.superpowers/` locally and never stage it.

---

### Task 1: Rename tracked documentation and rewrite links

**Files:**

- Move the tracked documentation tree to `docs/project/`.
- Modify: `README.md:70-72`
- Modify: `docs/project/plans/2026-08-17-slow-dating-app-roadmap.md:26-58`
- Modify: `docs/project/specs/2026-08-24-documentation-naming-design.md:10-18`

**Interfaces:**

- Consumes: existing Markdown paths under the tracked documentation tree.
- Produces: `docs/project/` as the only tracked documentation root.

- [ ] **Step 1: Capture the expected old-path references**

```powershell
rg -n 'former documentation path' README.md docs
```

Expected: README, roadmap, and naming design contain the old path.

- [ ] **Step 2: Move the documentation tree**

```powershell
git mv docs/<old-documentation-root> docs/project
```

- [ ] **Step 3: Replace old-path links**

Replace every old documentation path occurrence in tracked files with `docs/project/`.

- [ ] **Step 4: Verify local-only operational state remains untracked**

```powershell
rg -n 'former documentation path' README.md docs
```

The command must return no matches. Then execute `git diff --check` and inspect `git status --short`. `.superpowers/` may remain on disk but must not appear in Git status.

- [ ] **Step 5: Commit**

```powershell
git add README.md docs/project
```

Commit with message `docs: use neutral project documentation paths`.

### Task 2: Publish base and feature branches

**Files:**

- Modify: local Git remote configuration only.

**Interfaces:**

- Consumes: `origin` at `https://github.com/quanvn87/BlindInbox-Dating-App.git`.
- Produces: remote `master` and `feature/foundation-auth-profile` branches.

- [ ] **Step 1: Validate publish preconditions**

```powershell
git status --short
```

Expected: no output. Confirm `git remote -v` shows the supplied origin URL.

- [ ] **Step 2: Push base branch from primary checkout**

```powershell
git push -u origin master
```

- [ ] **Step 3: Push feature branch from this worktree**

```powershell
git push -u origin feature/foundation-auth-profile
```

Expected: GitHub offers a compare URL. Create a Pull Request with base `master`, compare `feature/foundation-auth-profile`, and title `Foundation authentication and profile onboarding`.
