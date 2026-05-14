/**
 * Snap-zone tests (P2.T2).
 *
 * Pure functions — `detectSnapZone` + `snapRect`. No DOM. Verifies
 * threshold math, top-edge priority over horizontal edges, full / left
 * / right rect resolution.
 *
 * Run:
 *   node --experimental-strip-types tests/engines/core-desktop/snap.test.ts
 */

import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname( fileURLToPath( import.meta.url ) );
const projectRoot = resolve( __dirname, '..', '..', '..' );

const snapModule = ( await import(
	resolve( projectRoot, 'src/runtime/engines/core-desktop/windowing/snap.ts' )
) ) as typeof import('../../../src/runtime/engines/core-desktop/windowing/snap');
const { detectSnapZone, snapRect, SNAP_THRESHOLD } = snapModule;

let pass = 0;
let fail = 0;

function ok( label: string, condition: boolean ): void {
	if ( condition ) {
		pass++;
		console.log( `PASS  ${ label }` );
	} else {
		fail++;
		console.log( `FAIL  ${ label }` );
	}
}

const ws = { x: 0, y: 0, w: 1600, h: 900 };

console.log( '— detectSnapZone —\n' );

ok( 'center → no zone', detectSnapZone( 800, 450, ws ) === null );
ok(
	'top edge inside threshold → full',
	detectSnapZone( 800, 4, ws ) === 'full'
);
ok(
	'top edge at threshold boundary → full',
	detectSnapZone( 800, SNAP_THRESHOLD, ws ) === 'full'
);
ok(
	'just past top threshold → no zone',
	detectSnapZone( 800, SNAP_THRESHOLD + 1, ws ) === null
);
ok(
	'left edge inside threshold → left',
	detectSnapZone( 4, 450, ws ) === 'left'
);
ok(
	'right edge inside threshold → right',
	detectSnapZone( ws.x + ws.w - 4, 450, ws ) === 'right'
);
ok(
	'top-left corner prefers top (full over left)',
	detectSnapZone( 4, 4, ws ) === 'full'
);
ok(
	'top-right corner prefers top (full over right)',
	detectSnapZone( ws.x + ws.w - 4, 4, ws ) === 'full'
);
ok( 'far outside workspace → null', detectSnapZone( -200, 450, ws ) === null );
ok(
	'bottom edge → no zone (bottom not snap-supported yet)',
	detectSnapZone( 800, ws.y + ws.h - 4, ws ) === null
);

console.log( '\n— snapRect —\n' );

ok( 'null zone → null rect', snapRect( null, ws ) === null );

const fullRect = snapRect( 'full', ws )!;
ok(
	'full → covers workspace',
	fullRect.x === 0 &&
		fullRect.y === 0 &&
		fullRect.w === 1600 &&
		fullRect.h === 900
);

const leftRect = snapRect( 'left', ws )!;
ok( 'left → x=0 + half-width', leftRect.x === 0 && leftRect.w === 800 );
ok( 'left → full height', leftRect.y === 0 && leftRect.h === 900 );

const rightRect = snapRect( 'right', ws )!;
ok( 'right → second half', rightRect.x === 800 && rightRect.w === 800 );
ok(
	'even-width halves abut',
	leftRect.x + leftRect.w === rightRect.x && leftRect.w === rightRect.w
);

const oddWs = { x: 0, y: 0, w: 1001, h: 700 };
const oddLeft = snapRect( 'left', oddWs )!;
const oddRight = snapRect( 'right', oddWs )!;
ok(
	'odd workspace width — halves abut without gap or overlap',
	oddLeft.w + oddRight.w === oddWs.w
);

console.log(
	`\n${ pass } passed, ${ fail } failed (${ pass + fail } total)\n`
);

if ( fail > 0 ) {
	process.exit( 1 );
}
