Create a structured implementation plan and save it as a file before writing any code.

When invoked with $ARGUMENTS (the feature or task to plan):

1. Create a file `plans/YYYY-MM-DD-<slug>.md` (create the `plans/` directory if needed)
2. Write the plan with these sections:
   - **Goal**: one sentence on what success looks like
   - **Context**: relevant files, existing patterns, constraints
   - **Approach**: step-by-step implementation strategy
   - **Files to change**: list with what changes in each
   - **Edge cases**: what could go wrong
   - **Definition of done**: how to verify it works
3. Present the plan to the user and wait for approval before implementing
4. After implementation, update the plan file with actual changes made

Do NOT start coding until the plan is written and confirmed.
