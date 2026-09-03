# Agent instructions

## Commit attribution

- Do not add an AI `Co-authored-by` trailer unless the user explicitly requests it in the current conversation.
- Do not bypass `.githooks/commit-msg` or apply the `allow-ai-coauthor` pull-request label without that explicit request.
- Before pushing, inspect the final commit message and remove accidental AI attribution trailers.
