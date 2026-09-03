#!/usr/bin/env bash
set -euo pipefail

self="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/$(basename "${BASH_SOURCE[0]}")"

# AI attribution is opt-in. This keeps an agent or editor integration from
# silently adding a Co-authored-by trailer the user did not ask for.
AI_TRAILER_PATTERN='^Co-authored-by:[[:space:]].*(Claude|Codex|ChatGPT|GitHub Copilot|noreply@(anthropic|openai)\.com)'

approved() {
  [[ "${HUDDLE_ALLOW_AI_COAUTHOR:-}" == "1" || "${AI_COAUTHOR_APPROVED:-}" == "true" ]]
}

# Deliberately NOT `grep -q`. Under `set -o pipefail`, grep -q exits the moment
# it matches, git gets SIGPIPE, and the pipeline reports 141 — so the caller
# reads "no match" precisely when there WAS one. That made a trailer sitting
# early in a long message pass the check, which is exactly what a squash merge
# produces when it concatenates several commit messages.
contains_ai_trailer() {
  grep -Ei "$AI_TRAILER_PATTERN" >/dev/null
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
      # Read the message into a variable first: a here-string cannot raise
      # SIGPIPE, so the result cannot depend on how fast the reader exits.
      message="$(git show -s --format=%B "$commit")"
      if contains_ai_trailer <<<"$message"; then
        reject "commit ${commit}"
      fi
    done < <(git rev-list "$commit_range")
    ;;
  --self-test)
    # The failure this guards against is silent, so it is checked rather than
    # assumed. Builds a throwaway repo whose trailer sits early in a long
    # message — the shape a squash merge produces, and the shape that
    # previously slipped through.
    work="$(mktemp -d)"
    trap 'rm -rf "$work"' EXIT
    git init -q "$work"
    git -C "$work" config user.email selftest@example.com
    git -C "$work" config user.name "Self Test"
    git -C "$work" commit -q --allow-empty -m base
    base="$(git -C "$work" rev-parse HEAD)"
    {
      echo "early trailer, long body"
      echo
      echo "Co-authored-by: Claude Opus 5 <noreply@anthropic.com>"
      echo
      for _ in $(seq 1 20000); do
        echo "filler xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
      done
    } >"$work/msg"
    git -C "$work" commit -q --allow-empty -F "$work/msg"
    dirty_head="$(git -C "$work" rev-parse HEAD)"
    git -C "$work" commit -q --allow-empty -m "clean message"
    clean_head="$(git -C "$work" rev-parse HEAD)"

    if git -C "$work" -c core.hooksPath=/dev/null log -1 >/dev/null 2>&1; then :; fi

    if (cd "$work" && HUDDLE_ALLOW_AI_COAUTHOR="" AI_COAUTHOR_APPROVED="" \
        bash "$self" --range "$base..$dirty_head" >/dev/null 2>&1); then
      echo "self-test FAILED: an early trailer in a long message was accepted" >&2
      exit 1
    fi

    if ! (cd "$work" && HUDDLE_ALLOW_AI_COAUTHOR="" AI_COAUTHOR_APPROVED="" \
        bash "$self" --range "$dirty_head..$clean_head" >/dev/null 2>&1); then
      echo "self-test FAILED: a clean commit was rejected" >&2
      exit 1
    fi

    echo "self-test passed"
    ;;
  *)
    echo "Usage: $0 --message-file <path> | --range <git-range> | --self-test" >&2
    exit 2
    ;;
esac
