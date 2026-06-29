#!/usr/bin/env bash
# Enforce that the caption-active color literal (per AGENTS.md CRITICAL RULES)
# only appears in caption-related code. The token exists once in styles.css
# as the definition; every other use must reference the CSS variable.
#
# Run locally:  ./scripts/check-caption-token.sh
# CI:           Add `pnpm exec bash scripts/check-caption-token.sh` to the workflow.

set -euo pipefail

cd "$(dirname "$0")/.."

# Allowed locations for the literal oklch value of caption-active.
ALLOW=(
    "src/styles.css"           # the variable definition itself
    "src/features/captions/"   # all caption code
)

# Match the literal oklch value (≈ #ffea00) in any source file.
LITERAL='oklch(0.92 0.18 95)'

status=0
while IFS= read -r match; do
    file=${match%%:*}
    ok=0
    for allow in "${ALLOW[@]}"; do
        if [[ "$file" == "$allow"* ]]; then
            ok=1
            break
        fi
    done
    if [[ $ok -eq 0 ]]; then
        echo "ERROR: caption-active literal found outside allowed paths:"
        echo "  $match"
        echo "  Use 'var(--caption-active)' instead of the literal oklch value."
        status=1
    fi
done < <(grep -rn -- "$LITERAL" src/ || true)

if [[ $status -eq 0 ]]; then
    echo "OK: caption-active literal only in allowed paths."
fi
exit $status
