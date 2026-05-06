/**
 * Density — `styles.density` writes a `data-wpds-density` attribute on the
 * shell root. WPDS already ships density-keyed gap/padding overrides under
 * `[data-wpds-density="..."]`, so the shell never needs per-density CSS.
 *
 * Allowed values: "default", "compact", "comfortable". Unknown values
 * fall back to "default" silently.
 */

export const ALLOWED_DENSITIES = [ 'default', 'compact', 'comfortable' ];

/**
 * Resolve the density value for the current styles tree. Returns
 * `'default'` when missing or invalid so a shell switching from
 * `compact` to a shell that omits density correctly overwrites the
 * stale attribute on `#wp-admin-shell` (rather than leaving the
 * previous shell's value attached).
 */
export function resolveDensity( styles ) {
	// Tier 1 (preferred): styles.theme.density — ThemeProvider seed shape.
	// Tier 4 (legacy): styles.density — kept for one cycle, dropped later.
	const raw =
		typeof styles?.theme?.density === 'string'
			? styles.theme.density
			: styles?.density;
	if ( typeof raw !== 'string' ) {
		return 'default';
	}
	return ALLOWED_DENSITIES.includes( raw ) ? raw : 'default';
}

/**
 * Strip the data-wpds-density attribute. Companion to `clearTokens()`
 * for the v2 in-process shell re-mount path. v1 page-reload makes
 * this redundant; v2 (issue #28) needs it before applying the next
 * shell's density.
 */
export function clearDensity( element ) {
	if ( ! element ) {
		return;
	}
	element.removeAttribute( 'data-wpds-density' );
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
