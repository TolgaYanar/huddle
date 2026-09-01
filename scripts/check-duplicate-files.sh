#!/usr/bin/env bash
#
# Fails when a macOS iCloud/FileProvider duplicate is present in the working
# tree. Those appear as "name 2.ext" next to the original "name.ext" and have
# broken a type-check run once by shadowing a Next type file, and appeared once
# inside a Prisma migration directory, where a stray copy is a deploy hazard.
#
# Why this is a check and not a .gitignore rule: a "* 2.*" pattern also matches
# legitimate names such as "docs/OAuth 2.md" and would silently drop them from
# every commit. The duplicate's real signature is the sibling: a FileProvider
# copy only exists when the original sits beside it under the same name. That
# is what this script tests, so "docs/OAuth 2.md" passes unless "docs/OAuth.md"
# also exists.
#
# Checks every path component, so a duplicated directory ("migrations/x 2/") is
# caught as well as a duplicated file.

set -euo pipefail

cd "$(dirname "$0")/.."

found=0

report() {
  if [ "$found" -eq 0 ]; then
    echo "macOS FileProvider duplicates found (copy sits beside its original):" >&2
    echo >&2
  fi
  found=1
  echo "  $1  ->  duplicate of  $2" >&2
}

# Tracked files plus untracked ones that are not ignored. -z keeps names with
# spaces intact, which every duplicate has by construction.
while IFS= read -r -d '' path; do
  prefix=""
  remainder="$path"

  while [ -n "$remainder" ]; do
    component="${remainder%%/*}"
    if [ "$component" = "$remainder" ]; then
      remainder=""
    else
      remainder="${remainder#*/}"
    fi

    # "base N.ext" or "base N" where N is a copy index.
    if [[ "$component" =~ ^(.+)\ ([0-9]+)(\.[^.]*)?$ ]]; then
      original="${BASH_REMATCH[1]}${BASH_REMATCH[3]:-}"
      if [ -e "${prefix}${original}" ]; then
        report "${prefix}${component}" "${prefix}${original}"
        break
      fi
    fi

    prefix="${prefix}${component}/"
  done
done < <(git ls-files -z --cached --others --exclude-standard | sort -zu)

if [ "$found" -ne 0 ]; then
  echo >&2
  echo "Delete the copies, then re-run: bash scripts/check-duplicate-files.sh" >&2
  exit 1
fi

echo "No macOS FileProvider duplicates found."
