/**
 * Synthesize the `default-route` the kernel router lands on.
 *
 * Preferred: `workspace.default-screen` → that screen's `path`. Fallback:
 * the first screen with a path. Last resort: `/`.
 *
 * @param {Object} screens         Resolved screens block.
 * @param {string} defaultScreenId `workspace.default-screen`.
 * @return {string}
 */
export function synthesizeDefaultRoute( screens, defaultScreenId = '' ) {
	const map = screens || {};
	if (
		defaultScreenId !== '' &&
		map[ defaultScreenId ] &&
		typeof map[ defaultScreenId ].path === 'string' &&
		map[ defaultScreenId ].path !== ''
	) {
		return map[ defaultScreenId ].path;
	}
	for ( const screen of Object.values( map ) ) {
		if (
			screen &&
			typeof screen === 'object' &&
			typeof screen.path === 'string' &&
			screen.path !== ''
		) {
			return screen.path;
		}
	}
	return '/';
}
