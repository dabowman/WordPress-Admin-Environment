#!/usr/bin/env node
/**
 * platformServices accessor tests (V2.M2 task 6).
 *
 * Covers `src/runtime/regions/platformServices.mjs` — the dispatch
 * vocabulary the Region renderer + engine bucketing read. v2
 * declarations expose services via `region.platform`; v1 shells bridge
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
	triggerShortcut,
	wantsDirtyState,
	blocksNavigationOnDirty,
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
	platform: { modal: true, 'dismiss-on': [ 'Escape', 'backdrop-click' ] },
};
ok( 'isModal: platform.modal=true', isModal( v2Modal ) === true );
ok(
	'dismissTriggers: from platform',
	eq( dismissTriggers( v2Modal ), [ 'Escape', 'backdrop-click' ] )
);
ok( 'placement: modal → overlay', placement( v2Modal ) === 'overlay' );

ok(
	'autofocusSelector: from platform',
	autofocusSelector( {
		platform: { 'autofocus-target': '#first-input' },
	} ) === '#first-input'
);

ok(
	'persistsAcrossNavigation: from platform',
	persistsAcrossNavigation( {
		platform: { 'persists-across-navigation': true },
	} ) === true
);

ok(
	'isTriggerable: from platform',
	isTriggerable( { platform: { triggerable: true } } ) === true
);

ok(
	'triggerShortcut: from platform.trigger.shortcut',
	triggerShortcut( {
		platform: { trigger: { shortcut: 'Mod+K' } },
	} ) === 'Mod+K'
);

ok(
	'wantsDirtyState: from platform',
	wantsDirtyState( { platform: { 'dirty-state': true } } ) === true
);

ok(
	'blocksNavigationOnDirty: from platform',
	blocksNavigationOnDirty( {
		platform: { 'block-navigation-on-dirty': true },
	} ) === true
);

console.log( '\n— platformServices: role=dialog implies modal —\n' );

ok(
	'isModal: role=dialog with no platform.modal still modal',
	isModal( { role: 'dialog' } ) === true
);
ok(
	'isModal: role=alertdialog also modal',
	isModal( { role: 'alertdialog' } ) === true
);
ok(
	'isModal: explicit platform.modal=false overrides role=dialog',
	isModal( { role: 'dialog', platform: { modal: false } } ) === false
);

console.log( '\n— platformServices: v1 legacy bridges —\n' );

ok(
	'overlay-region: isModal true',
	isModal( { source: 'core:overlay-region' } ) === true
);
ok(
	'overlay-region: dismissTriggers Escape + backdrop-click',
	eq( dismissTriggers( { source: 'core:overlay-region' } ), [ 'Escape', 'backdrop-click' ] )
);
ok(
	'overlay-region: placement overlay',
	placement( { source: 'core:overlay-region' } ) === 'overlay'
);

ok(
	'drawer-region: not modal',
	isModal( { source: 'core:drawer-region' } ) === false
);
ok(
	'drawer-region: placement drawer',
	placement( { source: 'core:drawer-region' } ) === 'drawer'
);
ok(
	'drawer-region: legacy config.dismissOn pipe-string normalized',
	eq(
		dismissTriggers( {
			source: 'core:drawer-region',
			config: { dismissOn: 'escape | overlay-click' },
		} ),
		[ 'Escape', 'backdrop-click' ]
	)
);
ok(
	'drawer-region: array config preserved + tokenized',
	eq(
		dismissTriggers( {
			source: 'core:drawer-region',
			config: { dismissOn: [ 'escape' ] },
		} ),
		[ 'Escape' ]
	)
);
ok(
	'drawer-region: autofocus selector default',
	autofocusSelector( { source: 'core:drawer-region' } ) === '[data-autofocus]'
);

ok(
	'sidebar-region: persists',
	persistsAcrossNavigation( { source: 'core:sidebar-region' } ) === true
);
ok(
	'toolbar-region: persists',
	persistsAcrossNavigation( { source: 'core:toolbar-region' } ) === true
);
ok(
	'content-region: placement persistent',
	placement( { source: 'core:content-region' } ) === 'persistent'
);
ok(
	'content-region: not modal',
	isModal( { source: 'core:content-region' } ) === false
);
ok(
	'content-region: does not persist by default',
	persistsAcrossNavigation( { source: 'core:content-region' } ) === false
);

console.log( '\n— platformServices: drawer pattern (role=complementary + dismiss) —\n' );

ok(
	'v2 drawer pattern: complementary + dismiss-on → drawer placement',
	placement( {
		role: 'complementary',
		platform: { 'dismiss-on': [ 'Escape' ] },
	} ) === 'drawer'
);
ok(
	'v2 complementary without dismiss-on: persistent',
	placement( { role: 'complementary' } ) === 'persistent'
);

console.log( '\n— platformServices: defaults / empties —\n' );

ok(
	'no platform, no source: placement persistent',
	placement( {} ) === 'persistent'
);
ok(
	'no platform, no source: dismissTriggers empty array',
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
		modal: true,
		'dismiss-on': [ 'Escape' ],
		'autofocus-target': '#x',
		triggerable: true,
		'persists-across-navigation': false,
		'dirty-state': true,
		'block-navigation-on-dirty': true,
		trigger: { shortcut: 'Mod+S' },
	},
} );
ok( 'aggregate: isModal', services.isModal === true );
ok( 'aggregate: dismissTriggers', eq( services.dismissTriggers, [ 'Escape' ] ) );
ok( 'aggregate: autofocusSelector', services.autofocusSelector === '#x' );
ok( 'aggregate: triggerable', services.isTriggerable === true );
ok( 'aggregate: shortcut', services.triggerShortcut === 'Mod+S' );
ok( 'aggregate: dirty-state', services.wantsDirtyState === true );
ok( 'aggregate: block-on-dirty', services.blocksNavigationOnDirty === true );
ok( 'aggregate: placement overlay', services.placement === 'overlay' );

console.log( `\n— Summary —\nPASS: ${ pass }  FAIL: ${ fail }` );
process.exit( fail === 0 ? 0 : 1 );
