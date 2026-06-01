/**
 * Builds a `wp option update` CLI command string for the given option name and
 * value. Always uses `wp option update` (not raw SQL) so that
 * `sanitize_option`, the `update_option_{$name}` hooks, and the `alloptions`
 * cache are all respected.
 *
 * Shell-escapes the value with single quotes; embedded single quotes are
 * replaced with the safe `'"'"'` idiom so the resulting command can be pasted
 * into any POSIX shell verbatim.
 *
 * @param {string} name  The `wp_options` option name (e.g. `comment_moderation`).
 * @param {string} value The string value to write.
 * @return {string} A ready-to-paste WP-CLI command.
 */
export function buildOptionCliCommand( name, value ) {
	// Replace every ' with '"'"' so the value can be wrapped in single quotes
	// without breaking the shell string.
	const escaped = String( value ).replace( /'/g, "'\"'\"'" );
	return `wp option update '${ name }' '${ escaped }'`;
}
