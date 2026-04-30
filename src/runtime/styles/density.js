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
		// Surfacing a dev warning here trades silent no-op for a clear
		// signal that the kernel mounted before #wp-admin-shell existed
		// in the DOM. Production stays silent — the density attribute is
		// nice-to-have, not load-bearing.
		if (
			typeof process !== 'undefined' &&
			process.env?.NODE_ENV !== 'production'
		) {
			// eslint-disable-next-line no-console
			console.warn(
				'wp-admin-shell density: target element is null; #wp-admin-shell missing or kernel mounted too early.'
			);
		}
		return;
	}
	element.setAttribute( 'data-wpds-density', density );
}
