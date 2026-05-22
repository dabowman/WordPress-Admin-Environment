#!/usr/bin/env node
/**
 * Tests for the dataView cache LRU helper (`src/runtime/dataView/lruCache.mjs`).
 *
 * Item 7 of `docs/plans/2026-05-22-pr49-pre-merge-feedback.md` — caps the
 * persistent `cache` Map so a long-running session bouncing between many
 * entity-CRUD apps × variants × screens doesn't grow without bound.
 *
 * `inflight` is intentionally unbounded — see `useDataView.js` for the
 * rationale (self-limiting via `.finally`; bounding would risk dedup-
 * misses on pathological concurrent-fetch storms).
 *
 * Insertion-order eviction (not access-order) — re-reading an entry
 * doesn't promote it. Updating an existing key's value also doesn't
 * promote it (Map.set on existing key updates in place).
 */
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname   = dirname( fileURLToPath( import.meta.url ) );
const projectRoot = resolve( __dirname, '..', '..' );

const { lruSet, LRU_CAP: CAP } = await import(
	resolve( projectRoot, 'src/runtime/dataView/lruCache.mjs' )
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

ok( 'imported LRU_CAP equals 64 (default sizing)', CAP === 64 );

// -------------------------------------------------------------------- 1
// Overflow eviction.
{
	const m = new Map();
	for ( let i = 0; i < 70; i++ ) {
		lruSet( m, `k${ i }`, `v${ i }`, CAP );
	}
	ok( 'size capped at LRU_CAP after 70 inserts', m.size === CAP );

	// Oldest 6 keys (k0..k5) evicted; newest 64 (k6..k69) survive.
	const oldestEvicted = ! m.has( 'k0' ) && ! m.has( 'k5' );
	ok( 'oldest 6 keys evicted (insertion-order)', oldestEvicted );

	const newestPresent = m.has( 'k6' ) && m.has( 'k69' );
	ok( 'newest CAP keys present (k6..k69)', newestPresent );
}

// -------------------------------------------------------------------- 2
// Updating an existing key does NOT evict another key.
{
	const m = new Map();
	for ( let i = 0; i < CAP; i++ ) {
		lruSet( m, `k${ i }`, `v${ i }`, CAP );
	}
	ok( 'pre-condition: map at cap', m.size === CAP );

	// Overwrite an existing key — no eviction, value updated, size held.
	lruSet( m, 'k0', 'updated', CAP );
	ok( 'updating existing key holds size at CAP', m.size === CAP );
	ok( 'updated key still present + new value', m.get( 'k0' ) === 'updated' );
}

// -------------------------------------------------------------------- 3
// Updating an existing key does NOT promote (insertion order preserved).
// Inserts k0..k63, updates k0, then adds k64 — k0 (still oldest by
// insertion order) is the one evicted, not k1.
{
	const m = new Map();
	for ( let i = 0; i < CAP; i++ ) {
		lruSet( m, `k${ i }`, `v${ i }`, CAP );
	}
	lruSet( m, 'k0', 'updated', CAP ); // update — no promotion
	lruSet( m, 'k64', 'v64', CAP ); // overflow insert
	ok(
		'updating does NOT promote — oldest insertion still evicted first',
		! m.has( 'k0' ) && m.has( 'k1' ) && m.has( 'k64' )
	);
}

// -------------------------------------------------------------------- 4
// Chainable — returns the same map instance.
{
	const m = new Map();
	const returned = lruSet( m, 'a', 1, CAP );
	ok( 'lruSet returns the same map (chainable)', returned === m );
}

// -------------------------------------------------------------------- 5
// CAP of 0 / 1 edge cases.
{
	const m = new Map();
	lruSet( m, 'a', 1, 1 );
	lruSet( m, 'b', 2, 1 );
	ok( 'CAP=1 holds exactly one entry', m.size === 1 && m.has( 'b' ) );
}

// ── Summary ────────────────────────────────────────────────────────
console.log( '\n— Summary —' );
console.log( `PASS: ${ pass }  FAIL: ${ fail }` );
if ( fail > 0 ) {
	process.exit( 1 );
}
