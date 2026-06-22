Show a summary of all uncommitted changes in the current repository.

Run git diff and git diff --staged, then present a clean, readable summary:
- List modified files with a one-line description of what changed
- Highlight any potentially risky changes (deletions, config changes, dependency updates)
- Show the total lines added/removed
