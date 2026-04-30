/**
 * Density — `styles.density` writes a `data-wpds-density` attribute on the
 * shell root. WPDS already ships density-keyed gap/padding overrides under
 * `[data-wpds-density="..."]`, so the shell never needs per-density CSS.
 *
 * Allowed values: "default", "compact", "comfortable". Unknown values
 * fall back to "default" silently.
 */

export const ALLOWED_DENSITIES = [ 'default', 'compact', 'comfortable' ];

export function resolveDensity( styles ) {
	const raw = styles?.density;
	if ( typeof raw !== 'string' ) {
		return 'default';
	}
	return ALLOWED_DENSITIES.includes( raw ) ? raw : 'default';
}

export function applyDensity( element, density ) {
	if ( ! element ) {
		return;
	}
	element.setAttribute( 'data-wpds-density', density );
}
