#!/usr/bin/env node
/**
 * Tests for the `buildOptionCliCommand` pure helper
 * (`src/apps/_shared/fallback/buildOptionCliCommand.mjs`).
 *
 * Guards the two non-negotiable guardrails from `docs/no-api-fallback-pattern.md`:
 *   1. Output uses `wp option update`, never raw SQL.
 *   2. Workspace single-quote escaping is correct so the command can be pasted
 *      verbatim into any POSIX workspace without syntax errors.
 *
 * Run: `node tests/runtime/unavailable-via-api.test.mjs`
 * (chained from `npm run test:runtime`)
 */
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname( fileURLToPath( import.meta.url ) );
const projectRoot = resolve( __dirname, '..', '..' );

const { buildOptionCliCommand } = await import(
	resolve(
		projectRoot,
		'src/apps/_shared/fallback/buildOptionCliCommand.mjs'
	)
);

let pass = 0;
let fail = 0;
function ok( label, condition, detail = '' ) {
	if ( condition ) {
		pass++;
		console.log( `PASS  ${ label }` );
	} else {
		fail++;
		console.log( `FAIL  ${ label }${ detail ? ' — ' + detail : '' }` );
	}
}

console.log( '— buildOptionCliCommand: basic form —\n' );

const basic = buildOptionCliCommand( 'comment_moderation', '1' );
ok(
	'starts with "wp option update"',
	basic.startsWith( 'wp option update ' ),
	basic
);
ok(
	'does not contain SQL keywords (UPDATE … SET)',
	! /\bUPDATE\b.*\bSET\b/i.test( basic ),
	basic
);
ok(
	'contains the option name quoted',
	basic.includes( "'comment_moderation'" ),
	basic
);
ok( 'contains the value quoted', basic.includes( "'1'" ), basic );
ok(
	'exact output matches expected',
	basic === "wp option update 'comment_moderation' '1'",
	basic
);

console.log( '\n— buildOptionCliCommand: single-quote escaping —\n' );

// A value containing a single quote must not break the workspace string.
const withQuote = buildOptionCliCommand( 'blogname', "O'Reilly" );
ok(
	'does not contain an unescaped bare single quote inside the value',
	// The only bare ' chars are the outer wrapping quotes; the embedded ' is
	// escaped as '"'"' — verify by checking that "O'" does not appear verbatim.
	! withQuote.includes( "O'" ) || withQuote.includes( "O'\"'\"'" ),
	withQuote
);
ok(
	'escaped value produces correct workspace-safe string',
	withQuote === "wp option update 'blogname' 'O'\"'\"'Reilly'",
	withQuote
);

// The NAME operand must be escaped identically to the value — a name with an
// embedded single quote must not break the workspace string either.
const nameWithQuote = buildOptionCliCommand( "foo'bar", 'baz' );
ok(
	'escaped name produces correct workspace-safe string',
	nameWithQuote === "wp option update 'foo'\"'\"'bar' 'baz'",
	nameWithQuote
);

console.log( '\n— buildOptionCliCommand: empty value —\n' );

const empty = buildOptionCliCommand( 'ping_sites', '' );
ok(
	'empty value produces two adjacent single-quoted empty strings',
	empty === "wp option update 'ping_sites' ''",
	empty
);

console.log( '\n— buildOptionCliCommand: coerces non-string value —\n' );

const numeric = buildOptionCliCommand( 'posts_per_page', 10 );
ok(
	'numeric value is coerced to string',
	numeric === "wp option update 'posts_per_page' '10'",
	numeric
);

console.log( '\n— buildOptionCliCommand: never emits SQL —\n' );

// Even for values that look like SQL fragments.
const sqlIsh = buildOptionCliCommand(
	'blogname',
	"'; DROP TABLE wp_options; --"
);
// The whole output is still a `wp option update` command — never raw SQL.
ok(
	'SQL-ish value still produces a wp option update command',
	sqlIsh.startsWith( 'wp option update ' ),
	sqlIsh
);
// The dangerous fragment must survive only inside the single-quoted value arg.
// Split off the fixed `wp option update '<name>' ` prefix and assert the
// remaining value arg both opens with a single quote AND contains DROP TABLE —
// i.e. the fragment is quoted, never a bare unquoted workspace token. (Greedily
// stripping the quoted span — the old approach — could never fail here.)
const valueArg = sqlIsh.slice( "wp option update 'blogname' ".length );
ok(
	'the value arg is single-quoted (opens with a quote)',
	valueArg.startsWith( "'" ),
	valueArg
);
ok(
	'DROP TABLE only ever appears inside the quoted value, never unquoted',
	valueArg.includes( 'DROP TABLE' ) &&
		// No bare `; DROP TABLE` escaping the quoting: every literal single
		// quote in the source value is rewritten to the `'"'"'` idiom, so a
		// run of `; DROP TABLE` is never preceded by an unescaped lone `'`.
		! /(^|[^"])'; DROP TABLE/.test( valueArg ),
	valueArg
);

// ── summary ──────────────────────────────────────────────────────────────────
console.log( `\n${ pass } passed, ${ fail } failed` );
if ( fail > 0 ) {
	process.exit( 1 );
}
