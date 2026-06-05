#!/usr/bin/env node
/**
 * platformServices accessor tests (V2.M2 task 6).
 *
 * Covers `src/runtime/regions/platformServices.mjs` — the dispatch
 * vocabulary the Region renderer + engine bucketing read. v2
 * declarations expose services via `region.platform`; v1 workspaces bridge
 * via legacy `region.source` + `region.config`. Both shapes return the
 * same service shape so callers (engine layout, GenericRegion) stay
 * single-path.
 *
 * Run: `node tests/runtime/platform-services.test.mjs` (chained from
 * `npm run test:runtime`).
 */

import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname( fileURLToPath( import.meta.url ) );
const projectRoot = resolve( __dirname, '..', '..' );

const {
	getPlatformServices,
	isModal,
	dismissTriggers,
	autofocusSelector,
	persistsAcrossNavigation,
	isTriggerable,
	wantsDirtyState,
	blocksNavigationOnDirty,
	hostsDynamicChildren,
	placement,
} = await import(
	resolve( projectRoot, 'src/runtime/regions/platformServices.mjs' )
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

function eq( a, b ) {
	return JSON.stringify( a ) === JSON.stringify( b );
}

console.log( '— platformServices: explicit v2 platform block —\n' );

const v2Modal = {
	role: 'dialog',
	platform: { 'core:modal': true, 'core:dismiss-on': [ 'Escape', 'backdrop-click' ] },
};
ok( "isModal: platform['core:modal']=true", isModal( v2Modal ) === true );
ok(
	'dismissTriggers: from platform',
	eq( dismissTriggers( v2Modal ), [ 'Escape', 'backdrop-click' ] )
);
ok( 'placement: modal → overlay', placement( v2Modal ) === 'overlay' );

ok(
	'autofocusSelector: from platform',
	autofocusSelector( {
		platform: { 'core:autofocus-target': '#first-input' },
	} ) === '#first-input'
);

ok(
	'persistsAcrossNavigation: from platform',
	persistsAcrossNavigation( {
		platform: { 'core:persists-across-navigation': true },
	} ) === true
);

ok(
	'isTriggerable: from platform',
	isTriggerable( { platform: { 'core:triggerable': true } } ) === true
);

ok(
	'wantsDirtyState: from platform',
	wantsDirtyState( { platform: { 'core:dirty-state': true } } ) === true
);

ok(
	'blocksNavigationOnDirty: from platform',
	blocksNavigationOnDirty( {
		platform: { 'core:block-navigation-on-dirty': true },
	} ) === true
);

console.log( '\n— platformServices: role=dialog implies modal —\n' );

ok(
	"isModal: role=dialog with no platform['core:modal'] still modal",
	isModal( { role: 'dialog' } ) === true
);
ok(
	'isModal: role=alertdialog also modal',
	isModal( { role: 'alertdialog' } ) === true
);
ok(
	"isModal: explicit platform['core:modal']=false overrides role=dialog",
	isModal( { role: 'dialog', platform: { 'core:modal': false } } ) === false
);

console.log( '\n— platformServices: drawer pattern (role=complementary + dismiss) —\n' );

ok(
	'v2 drawer pattern: complementary + core:dismiss-on → drawer placement',
	placement( {
		role: 'complementary',
		platform: { 'core:dismiss-on': [ 'Escape' ] },
	} ) === 'drawer'
);
ok(
	'v2 complementary without core:dismiss-on: persistent',
	placement( { role: 'complementary' } ) === 'persistent'
);

console.log( '\n— platformServices: defaults / empties —\n' );

ok(
	'no platform: placement persistent',
	placement( {} ) === 'persistent'
);
ok(
	'no platform: dismissTriggers empty array',
	eq( dismissTriggers( {} ), [] )
);
ok(
	'null region: placement persistent',
	placement( null ) === 'persistent'
);
ok(
	'null region: getPlatformServices safe',
	typeof getPlatformServices( null ) === 'object'
);

console.log( '\n— platformServices: aggregate getPlatformServices —\n' );

const services = getPlatformServices( {
	role: 'dialog',
	platform: {
		'core:modal': true,
		'core:dismiss-on': [ 'Escape' ],
		'core:autofocus-target': '#x',
		'core:triggerable': true,
		'core:persists-across-navigation': false,
		'core:dirty-state': true,
		'core:block-navigation-on-dirty': true,
	},
} );
ok( 'aggregate: isModal', services.isModal === true );
ok( 'aggregate: dismissTriggers', eq( services.dismissTriggers, [ 'Escape' ] ) );
ok( 'aggregate: autofocusSelector', services.autofocusSelector === '#x' );
ok( 'aggregate: triggerable', services.isTriggerable === true );
ok( 'aggregate: dirty-state', services.wantsDirtyState === true );
ok( 'aggregate: block-on-dirty', services.blocksNavigationOnDirty === true );
ok( 'aggregate: placement overlay', services.placement === 'overlay' );

console.log( '\n— platformServices: hostsDynamicChildren —\n' );

ok(
	"hostsDynamicChildren: platform['core:dynamic-children']=true",
	hostsDynamicChildren( {
		platform: { 'core:dynamic-children': true },
	} ) === true
);
ok(
	'hostsDynamicChildren: missing platform → false',
	hostsDynamicChildren( { role: 'main' } ) === false
);
ok(
	"hostsDynamicChildren: platform['core:dynamic-children']=false → false",
	hostsDynamicChildren( {
		platform: { 'core:dynamic-children': false },
	} ) === false
);
ok(
	'hostsDynamicChildren: null region safe',
	hostsDynamicChildren( null ) === false
);
ok(
	'aggregate: hostsDynamicChildren surfaced',
	getPlatformServices( {
		platform: { 'core:dynamic-children': true },
	} ).hostsDynamicChildren === true
);

console.log( `\n— Summary —\nPASS: ${ pass }  FAIL: ${ fail }` );
process.exit( fail === 0 ? 0 : 1 );
