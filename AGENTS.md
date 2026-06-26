# Agent Instructions

- When the user asks to fix or work on an issue by number, such as `Fix issue #4`, immediately fetch the issue from GitHub for this repository before inferring requirements from local files.
- Use the GitHub issue title, body, comments, and linked context as the source of truth for the requested behavior, then inspect the local codebase to implement it.
- If GitHub is unavailable, say so and fall back to local context only after making that limitation clear.
