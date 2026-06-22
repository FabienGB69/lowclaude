3-tier Claude agent orchestration: route tasks to the right model based on complexity.

## Tier routing strategy

| Tier | Model | Use for |
|------|-------|---------|
| 1 - Fast | Haiku | Quick lookups, formatting, simple transforms, yes/no checks, boilerplate generation |
| 2 - Standard | Sonnet | Standard coding, refactoring, bug fixes, tests, API integration, code review |
| 3 - Deep | Opus | Complex architecture, multi-file refactors, security analysis, algorithm design, ambiguous requirements |

## When invoked with $ARGUMENTS

1. **Classify** the task into one of the three tiers using these signals:
   - Haiku: < 5 min task, single file, no reasoning required, output is mechanical
   - Sonnet: 5–30 min task, 1–5 files, standard engineering judgment needed
   - Opus: > 30 min task, system-level thinking, multiple trade-offs, unknown unknowns

2. **Spawn the right agent**: Use the Agent tool with `model: haiku | sonnet | opus` matching the tier.

3. **Escalate if blocked**: If a lower-tier agent returns "I'm not sure" or produces low-confidence output, re-run with the next tier up.

4. **Report tier used**: Always state which tier handled the task and why, so the user can calibrate future routing.

## Example routing

- "Format this JSON" → Haiku
- "Add pagination to the users API endpoint" → Sonnet  
- "Design the caching strategy for our multi-region setup" → Opus
- "Write a regex to match email addresses" → Haiku
- "Migrate from REST to GraphQL" → Opus
