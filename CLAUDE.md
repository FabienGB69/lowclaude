# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

`lowclaude` is a tool aimed at reducing token consumption when working with Claude ("economise des tokens"). The repository is in early stages — no implementation exists yet.

## Project Goal

The core objective is to minimize the number of tokens sent to and received from Claude, through techniques such as:
- Prompt compression and summarization
- Context pruning (removing irrelevant history)
- Response truncation or structured output
- Caching repeated patterns

## Repository Structure

```
lowclaude/
└── README.md   # Project title and tagline only
```

No source code, dependencies, or configuration files exist yet.

## Development Setup

> **To be filled in once the stack is chosen.** Add here:
> - Language / runtime (Node.js, Python, Go, …)
> - How to install dependencies
> - How to run the project locally

## Commands

> **To be filled in once build tooling is in place.** Expected sections:
>
> ```bash
> # Install
> # Build
> # Lint
> # Test (all)
> # Test (single)
> ```

## Code Conventions

> **To be defined.** Establish here:
> - Language-specific style guide or formatter config (Prettier, Black, gofmt, …)
> - Naming conventions for token-reduction utilities
> - How to document public API surface
