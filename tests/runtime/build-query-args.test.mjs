#!/usr/bin/env node
/**
 * Tests for `src/apps/_shared/dataviews/buildQueryArgs.mjs`.
 *
 * Verifies that the declarative view→REST mapper produces the same query-args
 * object that the three hand-rolled `useMemo` mappers in posts/users/comments
 * produce, so those apps can adopt it without behavioral regressions.
 *
 * Coverage:
 *   - Pagination (perPage / page, default param names, custom param names)
 *   - Sort (defaultField/defaultDirection, aliases, custom param names)
 *   - Search (present / absent / empty string)
 *   - Filters: `is` operator (scalar → REST param)
 *   - Filters: `isAny` operator (array → CSV, non-array wrap, empty skip)
 *   - Unknown operator silently ignored
 *   - Unknown field silently ignored
 *   - staticArgs — merged in first, filter values win on conflict
 *   - Null / missing view returns staticArgs unchanged
 *   - Empty mapping produces sensible defaults
 *   - Posts-app parity (status/author filters + _embed + context)
 *   - Users-app parity (roles `is`+`isAny`, registered_date alias)
 *   - Comments-app parity (date_gmt alias, status filter, context)
 */
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname( fileURLToPath( import.meta.url ) );
const projectRoot = resolve( __dirname, '..', '..' );

const { buildQueryArgs } = await import(
	resolve( projectRoot, 'src/apps/_shared/dataviews/buildQueryArgs.mjs' )
);

let pass = 0;
let fail = 0;

/**
 * @param {string}  label
 * @param {boolean} condition
 * @param {string}  [detail]
 */
function ok( label, condition, detail = '' ) {
	if ( condition ) {
		pass++;
		console.log( `PASS  ${ label }` );
	} else {
		fail++;
		console.log( `FAIL  ${ label }${ detail ? ' — ' + detail : '' }` );
	}
}

// ---------------------------------------------------------------------------
// Baseline / null-safety
// ---------------------------------------------------------------------------

ok(
	'null view returns empty staticArgs copy',
	JSON.stringify( buildQueryArgs( null, {}, { context: 'edit' } ) ) ===
		JSON.stringify( { context: 'edit' } )
);

ok(
	'undefined view returns empty staticArgs copy',
	JSON.stringify( buildQueryArgs( undefined, {} ) ) === '{}'
);

ok(
	'non-object view (string) returns staticArgs copy',
	JSON.stringify( buildQueryArgs( 'bad', {}, { a: 1 } ) ) ===
		JSON.stringify( { a: 1 } )
);

ok(
	'empty view {} returns defaults + staticArgs',
	( () => {
		const r = buildQueryArgs( {}, {} );
		// Without perPage/page the fields are absent; sort uses defaults.
		return r.orderby === 'date' && r.order === 'desc';
	} )()
);

// ---------------------------------------------------------------------------
// Pagination
// ---------------------------------------------------------------------------

ok(
	'perPage maps to per_page by default',
	buildQueryArgs( { perPage: 20, page: 1 }, {} ).per_page === 20
);

ok(
	'page maps to page by default',
	buildQueryArgs( { perPage: 20, page: 3 }, {} ).page === 3
);

ok(
	'custom pagination param names honored',
	( () => {
		const r = buildQueryArgs(
			{ perPage: 10, page: 2 },
			{ pagination: { perPage: 'limit', page: 'offset' } }
		);
		return r.limit === 10 && r.offset === 2 && ! r.per_page && ! r.page;
	} )()
);

ok(
	'absent perPage/page leaves params out of result',
	( () => {
		const r = buildQueryArgs( {}, {} );
		return ! ( 'per_page' in r ) && ! ( 'page' in r );
	} )()
);

// ---------------------------------------------------------------------------
// Sort
// ---------------------------------------------------------------------------

ok(
	'sort.field passes through as orderby',
	buildQueryArgs( { sort: { field: 'title', direction: 'asc' } }, {} )
		.orderby === 'title'
);

ok(
	'sort.direction passes through as order',
	buildQueryArgs( { sort: { field: 'title', direction: 'asc' } }, {} )
		.order === 'asc'
);

ok(
	'sort alias rewrites field id to REST param',
	buildQueryArgs(
		{ sort: { field: 'date', direction: 'desc' } },
		{ sort: { aliases: { date: 'date_gmt' } } }
	).orderby === 'date_gmt'
);

ok(
	'unknown sort field passes through unchanged',
	buildQueryArgs(
		{ sort: { field: 'name', direction: 'asc' } },
		{ sort: { aliases: { date: 'date_gmt' } } }
	).orderby === 'name'
);

ok(
	'absent sort uses defaultField and defaultDirection',
	( () => {
		const r = buildQueryArgs(
			{},
			{
				sort: {
					defaultField: 'name',
					defaultDirection: 'asc',
				},
			}
		);
		return r.orderby === 'name' && r.order === 'asc';
	} )()
);

ok(
	'null sort uses defaultField and defaultDirection',
	( () => {
		const r = buildQueryArgs(
			{ sort: null },
			{ sort: { defaultField: 'id', defaultDirection: 'asc' } }
		);
		return r.orderby === 'id' && r.order === 'asc';
	} )()
);

ok(
	'custom sort param names honored',
	( () => {
		const r = buildQueryArgs(
			{ sort: { field: 'date', direction: 'asc' } },
			{ sort: { orderby: '_sort', order: '_dir' } }
		);
		return (
			r._sort === 'date' && r._dir === 'asc' && ! r.orderby && ! r.order
		);
	} )()
);

// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------

ok(
	'search maps to search param by default',
	buildQueryArgs( { search: 'hello' }, {} ).search === 'hello'
);

ok(
	'absent search → no search param',
	! ( 'search' in buildQueryArgs( {}, {} ) )
);

ok(
	'empty-string search → no search param',
	! ( 'search' in buildQueryArgs( { search: '' }, {} ) )
);

ok(
	'custom search param name honored',
	( () => {
		const r = buildQueryArgs( { search: 'test' }, { search: 's' } );
		return r.s === 'test' && ! r.search;
	} )()
);

// ---------------------------------------------------------------------------
// Filters — `is` operator
// ---------------------------------------------------------------------------

ok(
	'`is` filter sets REST param to scalar value',
	buildQueryArgs(
		{ filters: [ { field: 'status', operator: 'is', value: 'draft' } ] },
		{ filters: { status: { is: 'status' } } }
	).status === 'draft'
);

ok(
	'`is` filter with falsy value (null) is skipped',
	! (
		'status' in
		buildQueryArgs(
			{ filters: [ { field: 'status', operator: 'is', value: null } ] },
			{ filters: { status: { is: 'status' } } }
		)
	)
);

ok(
	'`is` filter with empty string is skipped',
	! (
		'author' in
		buildQueryArgs(
			{ filters: [ { field: 'author', operator: 'is', value: '' } ] },
			{ filters: { author: { is: 'author' } } }
		)
	)
);

ok(
	'`is` filter maps field to different REST param name',
	buildQueryArgs(
		{ filters: [ { field: 'author', operator: 'is', value: 5 } ] },
		{ filters: { author: { is: 'author_id' } } }
	).author_id === 5
);

// ---------------------------------------------------------------------------
// Filters — `isAny` operator
// ---------------------------------------------------------------------------

ok(
	'`isAny` with array joins to CSV',
	buildQueryArgs(
		{
			filters: [
				{
					field: 'status',
					operator: 'isAny',
					value: [ 'draft', 'pending' ],
				},
			],
		},
		{ filters: { status: { isAny: 'status' } } }
	).status === 'draft,pending'
);

ok(
	'`isAny` with non-array wraps value',
	buildQueryArgs(
		{
			filters: [ { field: 'roles', operator: 'isAny', value: 'editor' } ],
		},
		{ filters: { roles: { isAny: 'roles' } } }
	).roles === 'editor'
);

ok(
	'`isAny` with empty array is skipped',
	! (
		'status' in
		buildQueryArgs(
			{
				filters: [ { field: 'status', operator: 'isAny', value: [] } ],
			},
			{ filters: { status: { isAny: 'status' } } }
		)
	)
);

ok(
	'`isAny` filters out empty-string values within array',
	( () => {
		const r = buildQueryArgs(
			{
				filters: [
					{
						field: 'roles',
						operator: 'isAny',
						value: [ 'admin', '', null ],
					},
				],
			},
			{ filters: { roles: { isAny: 'roles' } } }
		);
		return r.roles === 'admin';
	} )()
);

ok(
	'`isAny` with array of all-empty values is skipped',
	! (
		'roles' in
		buildQueryArgs(
			{
				filters: [
					{ field: 'roles', operator: 'isAny', value: [ '' ] },
				],
			},
			{ filters: { roles: { isAny: 'roles' } } }
		)
	)
);

ok(
	'`isAny` can map to a different REST param than `is`',
	( () => {
		const r = buildQueryArgs(
			{
				filters: [
					{
						field: 'status',
						operator: 'isAny',
						value: [ 'a', 'b' ],
					},
				],
			},
			{ filters: { status: { is: 'status', isAny: 'status__in' } } }
		);
		return r.status__in === 'a,b' && ! r.status;
	} )()
);

// ---------------------------------------------------------------------------
// Unknown operators / unknown fields
// ---------------------------------------------------------------------------

ok(
	'unknown operator (isAll) is silently ignored',
	( () => {
		const r = buildQueryArgs(
			{
				filters: [
					{
						field: 'tag',
						operator: 'isAll',
						value: [ 'a', 'b' ],
					},
				],
			},
			{ filters: { tag: { is: 'tags', isAny: 'tags' } } }
		);
		return ! ( 'tags' in r );
	} )()
);

ok(
	'unknown field (no mapping) is silently ignored',
	( () => {
		const r = buildQueryArgs(
			{
				filters: [ { field: 'mystery', operator: 'is', value: 'x' } ],
			},
			{ filters: { status: { is: 'status' } } }
		);
		return ! ( 'mystery' in r );
	} )()
);

// ---------------------------------------------------------------------------
// staticArgs merging
// ---------------------------------------------------------------------------

ok(
	'staticArgs appear in output',
	( () => {
		const r = buildQueryArgs(
			{ perPage: 20, page: 1 },
			{},
			{ context: 'edit', _embed: 'author' }
		);
		return r.context === 'edit' && r._embed === 'author';
	} )()
);

ok(
	'filter-derived value overrides staticArgs on conflict',
	( () => {
		// staticArgs sets status:'any'; filter sets status:'draft' → draft wins.
		const r = buildQueryArgs(
			{
				filters: [
					{ field: 'status', operator: 'is', value: 'draft' },
				],
			},
			{ filters: { status: { is: 'status' } } },
			{ status: 'any' }
		);
		return r.status === 'draft';
	} )()
);

ok(
	'staticArgs not mutated by buildQueryArgs',
	( () => {
		const statics = { context: 'edit' };
		buildQueryArgs( { perPage: 10 }, {}, statics );
		return Object.keys( statics ).length === 1;
	} )()
);

// ---------------------------------------------------------------------------
// Per-app parity — Posts
// ---------------------------------------------------------------------------

// Replicates posts/index.js queryArgs with status='any', no filters active.
ok(
	'posts parity: basic query without filters',
	( () => {
		const POSTS_MAPPING = {
			sort: { defaultField: 'date', defaultDirection: 'desc' },
			filters: {
				status: { is: 'status', isAny: 'status' },
				author: { is: 'author' },
			},
		};
		const view = {
			perPage: 20,
			page: 1,
			sort: { field: 'date', direction: 'desc' },
			search: '',
			filters: [],
		};
		const r = buildQueryArgs( view, POSTS_MAPPING, {
			context: 'edit',
			_embed: 'author',
			status: 'any',
		} );
		return (
			r.per_page === 20 &&
			r.page === 1 &&
			r.order === 'desc' &&
			r.orderby === 'date' &&
			r.context === 'edit' &&
			r._embed === 'author' &&
			r.status === 'any' &&
			! r.search
		);
	} )()
);

ok(
	'posts parity: `is` status filter overrides staticArgs default',
	( () => {
		const POSTS_MAPPING = {
			sort: { defaultField: 'date', defaultDirection: 'desc' },
			filters: {
				status: { is: 'status', isAny: 'status' },
				author: { is: 'author' },
			},
		};
		const view = {
			perPage: 20,
			page: 1,
			sort: { field: 'date', direction: 'desc' },
			search: 'hello',
			filters: [
				{ field: 'status', operator: 'is', value: 'draft' },
				{ field: 'author', operator: 'is', value: 3 },
			],
		};
		const r = buildQueryArgs( view, POSTS_MAPPING, {
			context: 'edit',
			_embed: 'author',
			status: 'any',
		} );
		return r.status === 'draft' && r.author === 3 && r.search === 'hello';
	} )()
);

ok(
	'posts parity: `isAny` status filter joins array to CSV',
	( () => {
		const POSTS_MAPPING = {
			sort: { defaultField: 'date', defaultDirection: 'desc' },
			filters: {
				status: { is: 'status', isAny: 'status' },
				author: { is: 'author' },
			},
		};
		const view = {
			perPage: 20,
			page: 1,
			sort: { field: 'date', direction: 'desc' },
			search: '',
			filters: [
				{
					field: 'status',
					operator: 'isAny',
					value: [ 'draft', 'pending' ],
				},
			],
		};
		const r = buildQueryArgs( view, POSTS_MAPPING, {
			status: 'any',
		} );
		return r.status === 'draft,pending';
	} )()
);

// ---------------------------------------------------------------------------
// Per-app parity — Users
// ---------------------------------------------------------------------------

ok(
	'users parity: basic query, no filter',
	( () => {
		const USERS_MAPPING = {
			sort: {
				defaultField: 'name',
				defaultDirection: 'asc',
				aliases: { registered_date: 'registered_date' },
			},
			filters: {
				roles: { is: 'roles', isAny: 'roles' },
			},
		};
		const view = {
			perPage: 20,
			page: 1,
			sort: { field: 'name', direction: 'asc' },
			search: '',
			filters: [],
		};
		const r = buildQueryArgs( view, USERS_MAPPING, { context: 'edit' } );
		return (
			r.per_page === 20 &&
			r.page === 1 &&
			r.orderby === 'name' &&
			r.order === 'asc' &&
			r.context === 'edit' &&
			! r.roles &&
			! r.search
		);
	} )()
);

ok(
	'users parity: `is` roles filter',
	( () => {
		const USERS_MAPPING = {
			sort: {
				defaultField: 'name',
				defaultDirection: 'asc',
			},
			filters: {
				roles: { is: 'roles', isAny: 'roles' },
			},
		};
		const view = {
			perPage: 20,
			page: 1,
			sort: { field: 'name', direction: 'asc' },
			filters: [
				{ field: 'roles', operator: 'is', value: 'administrator' },
			],
		};
		const r = buildQueryArgs( view, USERS_MAPPING, { context: 'edit' } );
		return r.roles === 'administrator';
	} )()
);

ok(
	'users parity: `isAny` roles filter (array → CSV)',
	( () => {
		const USERS_MAPPING = {
			sort: { defaultField: 'name', defaultDirection: 'asc' },
			filters: {
				roles: { is: 'roles', isAny: 'roles' },
			},
		};
		const view = {
			perPage: 20,
			page: 1,
			sort: { field: 'name', direction: 'asc' },
			filters: [
				{
					field: 'roles',
					operator: 'isAny',
					value: [ 'editor', 'author' ],
				},
			],
		};
		const r = buildQueryArgs( view, USERS_MAPPING, { context: 'edit' } );
		return r.roles === 'editor,author';
	} )()
);

ok(
	'users parity: registered_date sort field passes through alias unchanged',
	( () => {
		const USERS_MAPPING = {
			sort: {
				defaultField: 'name',
				defaultDirection: 'asc',
				// alias is identity — just confirming no transformation drops it
				aliases: { registered_date: 'registered_date' },
			},
			filters: {},
		};
		const view = {
			sort: { field: 'registered_date', direction: 'desc' },
		};
		const r = buildQueryArgs( view, USERS_MAPPING );
		return r.orderby === 'registered_date' && r.order === 'desc';
	} )()
);

// ---------------------------------------------------------------------------
// Per-app parity — Comments
// ---------------------------------------------------------------------------

ok(
	'comments parity: basic query, no filter',
	( () => {
		const COMMENTS_MAPPING = {
			sort: {
				defaultField: 'date_gmt',
				defaultDirection: 'desc',
				aliases: { date: 'date_gmt' },
			},
			filters: {
				status: { is: 'status', isAny: 'status' },
			},
		};
		const view = {
			perPage: 20,
			page: 1,
			sort: { field: 'date', direction: 'desc' },
			search: '',
			filters: [],
		};
		const r = buildQueryArgs( view, COMMENTS_MAPPING, {
			context: 'edit',
			status: 'any',
		} );
		return (
			r.per_page === 20 &&
			r.page === 1 &&
			r.orderby === 'date_gmt' &&
			r.order === 'desc' &&
			r.context === 'edit' &&
			r.status === 'any' &&
			! r.search
		);
	} )()
);

ok(
	'comments parity: `is` status filter overrides staticArgs default',
	( () => {
		const COMMENTS_MAPPING = {
			sort: {
				defaultField: 'date_gmt',
				defaultDirection: 'desc',
				aliases: { date: 'date_gmt' },
			},
			filters: {
				status: { is: 'status', isAny: 'status' },
			},
		};
		const view = {
			perPage: 20,
			page: 1,
			sort: { field: 'date', direction: 'desc' },
			search: '',
			filters: [ { field: 'status', operator: 'is', value: 'hold' } ],
		};
		const r = buildQueryArgs( view, COMMENTS_MAPPING, {
			status: 'any',
		} );
		return r.status === 'hold';
	} )()
);

ok(
	'comments parity: `isAny` status filter joins array to CSV',
	( () => {
		const COMMENTS_MAPPING = {
			sort: {
				defaultField: 'date_gmt',
				defaultDirection: 'desc',
				aliases: { date: 'date_gmt' },
			},
			filters: {
				status: { is: 'status', isAny: 'status' },
			},
		};
		const view = {
			perPage: 20,
			page: 1,
			sort: { field: 'date', direction: 'desc' },
			filters: [
				{
					field: 'status',
					operator: 'isAny',
					value: [ 'hold', 'spam' ],
				},
			],
		};
		const r = buildQueryArgs( view, COMMENTS_MAPPING, {
			status: 'any',
		} );
		return r.status === 'hold,spam';
	} )()
);

// ---------------------------------------------------------------------------
// Edge cases
// ---------------------------------------------------------------------------

ok(
	'multiple filters for different fields all applied',
	( () => {
		const r = buildQueryArgs(
			{
				perPage: 10,
				page: 1,
				filters: [
					{ field: 'status', operator: 'is', value: 'draft' },
					{ field: 'author', operator: 'is', value: 7 },
				],
			},
			{
				filters: {
					status: { is: 'status' },
					author: { is: 'author' },
				},
			}
		);
		return r.status === 'draft' && r.author === 7;
	} )()
);

ok(
	'last filter for same field wins (later entry overrides earlier)',
	( () => {
		const r = buildQueryArgs(
			{
				filters: [
					{ field: 'status', operator: 'is', value: 'draft' },
					{ field: 'status', operator: 'is', value: 'publish' },
				],
			},
			{ filters: { status: { is: 'status' } } }
		);
		return r.status === 'publish';
	} )()
);

ok(
	'non-array filters property is treated as empty',
	( () => {
		const r = buildQueryArgs(
			{ perPage: 10, filters: null },
			{ filters: { status: { is: 'status' } } }
		);
		return ! ( 'status' in r );
	} )()
);

ok(
	'empty mapping produces pagination + sort defaults only',
	( () => {
		const r = buildQueryArgs( {
			perPage: 5,
			page: 2,
			sort: { field: 'title', direction: 'asc' },
			search: 'x',
			filters: [ { field: 'status', operator: 'is', value: 'draft' } ],
		} );
		return (
			r.per_page === 5 &&
			r.page === 2 &&
			r.orderby === 'title' &&
			r.order === 'asc' &&
			r.search === 'x' &&
			! ( 'status' in r )
		);
	} )()
);

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

console.log( `\n${ pass } passed, ${ fail } failed` );
process.exit( fail > 0 ? 1 : 0 );
