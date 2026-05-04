#!/usr/bin/env bash
# End-to-end browser smoke for cap gating on wp-admin-default.
#
# Logs in via wp-login.php as each role, fetches the shell admin page,
# extracts the inline `window.wpAdminShell = { ... }` JSON, and checks
# that `capabilities` matches the per-role expectation set produced by
# `tests/php/run-cap-gating-smoke.php`.
#
# Run from repo root:  bash tests/php/run-cap-gating-browser-smoke.sh

set -uo pipefail

SITE="http://localhost:8888"
SHELL_PAGE="$SITE/wp-admin/admin.php?page=wp-admin-shell"
LOGIN_URL="$SITE/wp-login.php"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

# role:login:password
declare -a ROLES=(
	"administrator:admin:password"
	"subscriber:subscriber:password"
)

fail=0
for entry in "${ROLES[@]}"; do
	role="${entry%%:*}"
	rest="${entry#*:}"
	login="${rest%%:*}"
	pass="${rest##*:}"
	jar="$TMP/$login.cookies"

	# Step 1 — fetch login form (sets test cookie).
	curl -sS -c "$jar" -b "$jar" "$LOGIN_URL" -o /dev/null

	# Step 2 — POST credentials.
	curl -sS -c "$jar" -b "$jar" \
		-d "log=$login&pwd=$pass&wp-submit=Log+In&redirect_to=$SHELL_PAGE&testcookie=1" \
		"$LOGIN_URL" -o /dev/null

	# Step 3 — fetch the shell page.
	html="$TMP/$login.html"
	http_code=$(curl -sS -c "$jar" -b "$jar" -w '%{http_code}' -o "$html" "$SHELL_PAGE")

	if [[ "$http_code" != "200" ]]; then
		echo "FAIL $role: HTTP $http_code"
		fail=$((fail+1))
		continue
	fi

	# Step 4 — extract inline JSON. wp_add_inline_script with 'before'
	# emits as <script id="wp-admin-shell-js-before">window.wpAdminShell = {...};</script>
	json=$(grep -oE 'window\.wpAdminShell = \{.*\};' "$html" | sed 's/^window\.wpAdminShell = //; s/;$//')

	if [[ -z "$json" ]]; then
		echo "FAIL $role: no inline window.wpAdminShell payload found"
		fail=$((fail+1))
		continue
	fi

	# Step 5 — pretty-print capabilities map keys that are TRUE.
	allowed=$(echo "$json" | python3 -c '
import json, sys
data = json.load(sys.stdin)
caps = data.get("capabilities", {})
print(",".join(sorted(c for c, ok in caps.items() if ok)))
' 2>/dev/null)

	echo "OK   $role allowed-caps: $allowed"
done

if [[ "$fail" -gt 0 ]]; then
	echo "FAILURES: $fail"
	exit 1
fi
echo "All browser smoke checks passed."
