/**
 * Compat bridge — static aliases mapping legacy variable names to WPDS
 * tokens. Authors cannot remove or override; this is the contract that
 * makes legacy `@wordpress/components`, wp-admin pages, and SCSS-compiled
 * CSS inherit shell theming.
 *
 * Numeric derivations:
 *   --wp-admin-theme-color--rgb     R, G, B triplet of the brand strong.
 *   --wp-admin-theme-color-darker-20 = HSL.lightness(brand) − 20.
 *
 * The brand value must terminate at a literal hex/rgb after alias
 * chasing. If derivation fails, we fall back to the raw alias chain so
 * the page still themes — just without the legacy SCSS `rgba(var(--rgb))`
 * patterns. A console warning surfaces the misconfiguration.
 */

export function buildCompatBridge( wpdsMap ) {
	const brandStrong = wpdsMap[ '--wpds-color-bg-interactive-brand-strong' ];
	const brandStrongActive = wpdsMap[ '--wpds-color-bg-interactive-brand-strong-active' ];

	const out = {
		'--wp-admin-theme-color': 'var(--wpds-color-bg-interactive-brand-strong)',
		'--wp-admin-theme-color-darker-10': 'var(--wpds-color-bg-interactive-brand-strong-active)',
		'--wp-admin-border-width-focus': 'var(--wpds-border-width-focus)',
		'--wp-components-color-accent': 'var(--wpds-color-bg-interactive-brand-strong)',
		'--wp-components-color-background': 'var(--wpds-color-bg-surface-neutral-strong)',
		'--wp-components-color-foreground': 'var(--wpds-color-fg-content-neutral-default)',
	};

	const rgb = parseColorToRgb( brandStrong );
	if ( rgb ) {
		out[ '--wp-admin-theme-color--rgb' ] = `${ rgb.r }, ${ rgb.g }, ${ rgb.b }`;
	}

	const darker20 = darkenHexByLightness( brandStrong, 20 );
	if ( darker20 ) {
		out[ '--wp-admin-theme-color-darker-20' ] = darker20;
	} else if ( brandStrongActive ) {
		// Fallback: at least track the strong-active rather than dropping the var.
		out[ '--wp-admin-theme-color-darker-20' ] = 'var(--wpds-color-bg-interactive-brand-strong-active)';
	}

	return out;
}

function parseColorToRgb( value ) {
	if ( ! value || typeof value !== 'string' ) {
		return null;
	}
	const trimmed = value.trim();

	const hex3 = trimmed.match( /^#([0-9a-f]{3})$/i );
	if ( hex3 ) {
		const [ r, g, b ] = hex3[ 1 ].split( '' ).map( ( c ) => parseInt( c + c, 16 ) );
		return { r, g, b };
	}

	const hex6 = trimmed.match( /^#([0-9a-f]{6})$/i );
	if ( hex6 ) {
		const n = parseInt( hex6[ 1 ], 16 );
		return { r: ( n >> 16 ) & 0xff, g: ( n >> 8 ) & 0xff, b: n & 0xff };
	}

	const rgbFn = trimmed.match( /^rgb\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)$/i );
	if ( rgbFn ) {
		return { r: +rgbFn[ 1 ], g: +rgbFn[ 2 ], b: +rgbFn[ 3 ] };
	}

	return null;
}

function darkenHexByLightness( value, percent ) {
	const rgb = parseColorToRgb( value );
	if ( ! rgb ) {
		return null;
	}
	const hsl = rgbToHsl( rgb );
	const newL = Math.max( 0, hsl.l - percent );
	const out = hslToRgb( { h: hsl.h, s: hsl.s, l: newL } );
	return `rgb(${ round2( out.r ) }, ${ round2( out.g ) }, ${ round2( out.b ) })`;
}

function rgbToHsl( { r, g, b } ) {
	const r1 = r / 255;
	const g1 = g / 255;
	const b1 = b / 255;
	const max = Math.max( r1, g1, b1 );
	const min = Math.min( r1, g1, b1 );
	const l = ( max + min ) / 2;
	let h = 0;
	let s = 0;
	if ( max !== min ) {
		const d = max - min;
		s = l > 0.5 ? d / ( 2 - max - min ) : d / ( max + min );
		switch ( max ) {
			case r1: h = ( g1 - b1 ) / d + ( g1 < b1 ? 6 : 0 ); break;
			case g1: h = ( b1 - r1 ) / d + 2; break;
			case b1: h = ( r1 - g1 ) / d + 4; break;
		}
		h *= 60;
	}
	return { h, s: s * 100, l: l * 100 };
}

function hslToRgb( { h, s, l } ) {
	const s1 = s / 100;
	const l1 = l / 100;
	const c = ( 1 - Math.abs( 2 * l1 - 1 ) ) * s1;
	const hp = h / 60;
	const x = c * ( 1 - Math.abs( ( hp % 2 ) - 1 ) );
	let r = 0;
	let g = 0;
	let b = 0;
	if ( hp >= 0 && hp < 1 )      { r = c; g = x; }
	else if ( hp < 2 )            { r = x; g = c; }
	else if ( hp < 3 )            { g = c; b = x; }
	else if ( hp < 4 )            { g = x; b = c; }
	else if ( hp < 5 )            { r = x; b = c; }
	else                          { r = c; b = x; }
	const m = l1 - c / 2;
	return {
		r: ( r + m ) * 255,
		g: ( g + m ) * 255,
		b: ( b + m ) * 255,
	};
}

function round2( n ) {
	return Math.round( n * 100 ) / 100;
}
