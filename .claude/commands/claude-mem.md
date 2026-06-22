Manage Claude's memory across sessions using CLAUDE.md files.

When invoked:
- With no arguments: show what is currently remembered (read CLAUDE.md files in ~/.claude/ and project root)
- With "add [fact]": append a key fact or preference to the project CLAUDE.md
- With "forget [topic]": remove or update a memory entry
- With "list": display all memory entries organized by category
- With "sync": ensure project CLAUDE.md reflects current conventions discovered in the codebase

Memory categories to maintain:
- Project conventions (naming, formatting, patterns)
- User preferences (communication style, tool choices)
- Architectural decisions and their rationale
- Known gotchas and workarounds
- Recurring tasks and how to do them

Input: $ARGUMENTS
