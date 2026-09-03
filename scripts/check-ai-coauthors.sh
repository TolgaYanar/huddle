#!/usr/bin/env bash
set -euo pipefail

# AI attribution is opt-in. This keeps an agent or editor integration from
# silently adding a Co-authored-by trailer the user did not ask for.
AI_TRAILER_PATTERN='^Co-authored-by:[[:space:]].*(Claude|Codex|ChatGPT|GitHub Copilot|noreply@(anthropic|openai)\.com)'

approved() {
  [[ "${HUDDLE_ALLOW_AI_COAUTHOR:-}" == "1" || "${AI_COAUTHOR_APPROVED:-}" == "true" ]]
}

contains_ai_trailer() {
  grep -Eiq "$AI_TRAILER_PATTERN"
}

reject() {
  local target="$1"
  cat >&2 <<EOF
AI Co-authored-by trailer rejected in ${target}.

Huddle does not add AI co-author attribution unless the user explicitly asks
for it. For an intentional local commit, rerun with:

  HUDDLE_ALLOW_AI_COAUTHOR=1 git commit ...

For an intentional pull request, the user may apply the
"allow-ai-coauthor" label.
EOF
  exit 1
}

case "${1:-}" in
  --message-file)
    message_file="${2:-}"
    [[ -n "$message_file" && -r "$message_file" ]] || {
      echo "Usage: $0 --message-file <path>" >&2
      exit 2
    }
    if ! approved && contains_ai_trailer <"$message_file"; then
      reject "commit message"
    fi
    ;;
  --range)
    commit_range="${2:-}"
    [[ -n "$commit_range" ]] || {
      echo "Usage: $0 --range <git-range>" >&2
      exit 2
    }
    if approved; then
      exit 0
    fi
    while IFS= read -r commit; do
      if git show -s --format=%B "$commit" | contains_ai_trailer; then
        reject "commit ${commit}"
      fi
    done < <(git rev-list "$commit_range")
    ;;
  *)
    echo "Usage: $0 --message-file <path> | --range <git-range>" >&2
    exit 2
    ;;
esac
