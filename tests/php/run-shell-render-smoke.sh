#!/usr/bin/env bash
# Per-bundled-shell render + form-save smoke.
#
# For each registered shell:
#   1. POST options.php as admin to set wp_admin_shell_active_shell — exercises
#      the same sanitize/validate path as the in-product Settings page (covers
#      the PHP 8.1+ NULL-sanitize regression fixed in 8cd79ef).
#   2. Fetch /wp-admin/admin.php?page=wp-admin-shell, extract inline JSON,
#      confirm config has resolved `settings.applications`, `settings.navigation`,
#      and `settings.defaultRoute`. Catches the v1-canonical-path-drift bug
#      class at the wire layer.
#
# Restores the original active shell at end. Run from repo root.

set -uo pipefail

SITE="http://localhost:8888"
SHELL_PAGE="$SITE/wp-admin/admin.php?page=wp-admin-shell"
SETTINGS_PAGE="$SITE/wp-admin/admin.php?page=wp-admin-shell-settings"
LOGIN_URL="$SITE/wp-login.php"
OPTIONS_URL="$SITE/wp-admin/options.php"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
JAR="$TMP/admin.cookies"

# Step 1 — admin login.
curl -sS -c "$JAR" -b "$JAR" "$LOGIN_URL" -o /dev/null
curl -sS -c "$JAR" -b "$JAR" \
	-d "log=admin&pwd=password&wp-submit=Log+In&redirect_to=$SHELL_PAGE&testcookie=1" \
	"$LOGIN_URL" -o /dev/null

# Step 2 — capture the original active shell so we can restore at the end.
ORIG_SHELL=$(npx --quiet wp-env run cli -- wp option get wp_admin_shell_active_shell 2>/dev/null | tail -1 | tr -d '\r\n')
ORIG_SHELL="${ORIG_SHELL:-wp-admin-default}"

SHELLS=(
	"wp-admin-default"
	"developer-admin"
	"content-author"
	"client-portal"
	"v2-demo"
)

fail=0

for slug in "${SHELLS[@]}"; do
	# Step 3 — fetch settings page to harvest the nonce field for options.php.
	settings_html=$(curl -sS -c "$JAR" -b "$JAR" "$SETTINGS_PAGE")
	nonce=$(echo "$settings_html" | grep -oE 'name="_wpnonce" value="[a-f0-9]+"' | head -1 | sed 's/.*value="\([a-f0-9]*\)".*/\1/')
	referer_field=$(echo "$settings_html" | grep -oE 'name="_wp_http_referer" value="[^"]*"' | head -1 | sed 's/.*value="\([^"]*\)".*/\1/')

	if [[ -z "$nonce" ]]; then
		echo "FAIL $slug: could not harvest options.php nonce"
		fail=$((fail+1))
		continue
	fi

	# Step 4 — POST to options.php exactly as the WP settings form does.
	curl -sS -c "$JAR" -b "$JAR" \
		--data-urlencode "option_page=wp_admin_shell_settings" \
		--data-urlencode "action=update" \
		--data-urlencode "_wpnonce=$nonce" \
		--data-urlencode "_wp_http_referer=$referer_field" \
		--data-urlencode "wp_admin_shell_active_shell=$slug" \
		--data-urlencode "submit=Save Changes" \
		"$OPTIONS_URL" -o /dev/null

	# Step 5 — confirm the option round-tripped.
	got=$(npx --quiet wp-env run cli -- wp option get wp_admin_shell_active_shell 2>/dev/null | tail -1 | tr -d '\r\n')
	if [[ "$got" != "$slug" ]]; then
		echo "FAIL $slug: option after POST = '$got' (expected '$slug')"
		fail=$((fail+1))
		continue
	fi

	# Step 6 — fetch the shell page, extract inline payload, validate shape.
	html="$TMP/$slug.html"
	curl -sS -c "$JAR" -b "$JAR" "$SHELL_PAGE" -o "$html"
	json=$(grep -oE 'window\.wpAdminShell = \{.*\};' "$html" | sed 's/^window\.wpAdminShell = //; s/;$//')

	if [[ -z "$json" ]]; then
		echo "FAIL $slug: no inline window.wpAdminShell payload"
		fail=$((fail+1))
		continue
	fi

	report=$(echo "$json" | python3 -c '
import json, sys
data = json.load(sys.stdin)
config = data.get("config", {})
settings = config.get("settings", {})
apps = settings.get("applications", config.get("applications", []))
nav = settings.get("navigation", config.get("navigation"))
# v1 partitioned shape: navigation lives inside the __nav app config.items.
if nav is None and isinstance(apps, list):
    for a in apps:
        if isinstance(a, dict) and a.get("id") == "__nav":
            nav = a.get("config", {}).get("items", [])
            break
if nav is None:
    nav = []
default_route = settings.get("defaultRoute", config.get("defaultRoute", config.get("defaultApp")))
ok = (
    isinstance(apps, list) and len(apps) > 0
    and isinstance(nav, list) and len(nav) > 0
    and bool(default_route)
)
print(f"apps={len(apps)} nav={len(nav)} defaultRoute={default_route} ok={ok}")
' 2>/dev/null)

	if [[ "$report" == *"ok=True"* ]]; then
		echo "PASS $slug — $report"
	else
		echo "FAIL $slug — $report"
		fail=$((fail+1))
	fi
done

# Step 7 — restore original shell.
npx --quiet wp-env run cli -- wp admin-shell activate "$ORIG_SHELL" 2>/dev/null >/dev/null

if [[ "$fail" -gt 0 ]]; then
	echo "FAILURES: $fail"
	exit 1
fi
echo "All bundled shells render + form-save round-trip cleanly. Restored active shell: $ORIG_SHELL."
