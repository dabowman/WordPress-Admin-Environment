#!/usr/bin/env node
/**
 * Defensive JS-side merge of engine `default-styles` (Phase C).
 *
 * The PHP resolver applies engine defaults UNDER admin.json server-side
 * before the kernel ever sees the config. The kernel re-runs the same
 * merge defensively for callers that bypass PHP — tests, Storybook
 * stories, alternative SSR pipelines.
 *
 * `kernel.js`'s `deepMergeUnder` is not exported; this suite tests an
 * inline copy with the same contract. If the kernel implementation
 * drifts, the test will start producing different output and fail
 * before the runtime drifts.
 */

let pass = 0;
let fail = 0;

function ok( label, condition, detail = '' ) {
	if ( condition ) {
		pass++;
		console.log( `PASS  ${ label }` );
	} else {
		fail++;
		console.log( `FAIL  ${ label }` );
		if ( detail ) {
			console.log( `      ${ detail }` );
		}
	}
}

function deepMergeUnder( over, under ) {
	if ( under === null || under === undefined ) {
		return over;
	}
	if ( over === null || over === undefined ) {
		return under;
	}
	if (
		typeof over !== 'object' ||
		typeof under !== 'object' ||
		Array.isArray( over ) ||
		Array.isArray( under )
	) {
		return over;
	}
	const out = { ...under };
	for ( const [ key, value ] of Object.entries( over ) ) {
		out[ key ] = deepMergeUnder( value, under[ key ] );
	}
	return out;
}

console.log( '\n— deepMergeUnder: shape contract —' );

// 1. Empty over, full under → under unchanged.
{
	const under = { a: 1, nested: { b: 2 } };
	const out = deepMergeUnder( {}, under );
	ok(
		'empty over preserves under fully',
		JSON.stringify( out ) === JSON.stringify( under )
	);
}

// 2. Full over, empty under → over unchanged.
{
	const over = { a: 1, nested: { b: 2 } };
	const out = deepMergeUnder( over, {} );
	ok(
		'empty under preserves over fully',
		JSON.stringify( out ) === JSON.stringify( over )
	);
}

// 3. Overlapping leaf — over wins.
{
	const out = deepMergeUnder( { color: '#fff' }, { color: '#000' } );
	ok( 'over wins on leaf overlap', out.color === '#fff' );
}

// 4. Non-overlapping keys — both contributors land.
{
	const out = deepMergeUnder(
		{ a: 1 },
		{ b: 2 }
	);
	ok( 'non-overlapping keys both land', out.a === 1 && out.b === 2 );
}

// 5. Deep merge — admin.json wins selectively.
{
	const over = {
		theme: {
			color: { bg: '#ffffff' },
		},
	};
	const under = {
		theme: {
			density: 'compact',
			color: {
				bg: '#1a1a1a',
				primary: '#ff5500',
			},
		},
	};
	const out = deepMergeUnder( over, under );
	ok( 'over wins on deep leaf overlap (theme.color.bg)', out.theme.color.bg === '#ffffff' );
	ok( 'under contributes theme.density', out.theme.density === 'compact' );
	ok(
		'under contributes non-overlapping theme.color.primary',
		out.theme.color.primary === '#ff5500'
	);
}

// 6. Arrays replaced wholesale (matches PHP merge for indexed arrays).
{
	const out = deepMergeUnder(
		{ list: [ 'a' ] },
		{ list: [ 'b', 'c' ] }
	);
	ok( 'arrays replaced wholesale', out.list.length === 1 && out.list[ 0 ] === 'a' );
}

// 7. Null over → falls through to under.
{
	const under = { a: 1 };
	const out = deepMergeUnder( null, under );
	ok( 'null over falls through to under', out === under );
}

// 8. Original under not mutated.
{
	const under = { a: 1, nested: { b: 2 } };
	const original = JSON.stringify( under );
	deepMergeUnder( { c: 3 }, under );
	ok( 'under not mutated by merge', JSON.stringify( under ) === original );
}

// 9. Mixed type collision — over's primitive replaces under's object.
{
	const out = deepMergeUnder(
		{ x: '#fff' },
		{ x: { nested: true } }
	);
	ok( 'over primitive replaces under object', out.x === '#fff' );
}

// 10. Engine-defaults realistic shape.
{
	const adminJson = {
		theme: {
			color: { primary: '#7c3aed' },
		},
	};
	const engineDefaults = {
		theme: {
			density: 'default',
			color: { bg: '#1a1a1a' },
		},
		chrome: {
			sidebar: { background: '#0a0a0a' },
		},
	};
	const merged = deepMergeUnder( adminJson, engineDefaults );
	ok( 'realistic: admin primary wins', merged.theme.color.primary === '#7c3aed' );
	ok( 'realistic: engine bg lands', merged.theme.color.bg === '#1a1a1a' );
	ok( 'realistic: engine density lands', merged.theme.density === 'default' );
	ok(
		'realistic: engine chrome lands',
		merged.chrome.sidebar.background === '#0a0a0a'
	);
}

console.log( '\n— Summary —' );
console.log( `PASS: ${ pass }  FAIL: ${ fail }` );
process.exit( fail === 0 ? 0 : 1 );
