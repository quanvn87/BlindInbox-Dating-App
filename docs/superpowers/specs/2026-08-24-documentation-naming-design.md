# Documentation naming design

## Goal

Present repository documentation with neutral, conventional names while
preserving product and implementation context for contributors.

## Decision

- Rename the tracked `docs/superpowers/` tree to `docs/project/`.
- Preserve its `specs/` and `plans/` subdirectories and every existing file.
- Update tracked documentation links that reference the old path.
- Keep `.superpowers/` as ignored local agent-operational state. It is not part
  of the Git repository and will not be pushed to GitHub.

## Verification

After the rename, a repository-wide search for `docs/superpowers` must return
no tracked reference. Git must recognize the change as renames/additions rather
than a loss of the product documentation.
