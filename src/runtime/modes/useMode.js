/**
 * React hook returning the resolved mode for the currently active screen.
 *
 * Reads:
 *   - The active screen id from the URL (v3 matches `screens[id].path`
 *     against the parsed URL primary path; if the active config has no
 *     `screens` block, the hook returns the
 *     default mode for every region).
 *   - The flattened engine-modes catalog from `window.wpAdminWorkspaces.engineModes`
 *     (populated by `WP_Admin_Workspaces_Modes::resolve_engine_modes()` in PHP).
 *
 * Returns `{ modal, regions, modeId, screenId }`. `regions` is the resolved
 * region-state map (region id → state object) or `null` when the active
 * mode is modal. `modeId` is the requested mode name (useful for
 * data-attribute emission). `screenId` is the matched screen id (or null
 * when no screen matches).
 *
 * Graceful degradation:
 *   - No engineModes block → returns `{ modal: false, regions: {} }` (i.e.
 *     all regions render normally).
 *   - No screens block → returns `{ modal: false, regions: {} }` (same).
 *   - URL doesn't match any screen → returns `{ modal: false, regions: {} }`.
 *   - Modal mode → returns `{ modal: true, regions: null }`; Region.js
 *     leaves chrome alone.
 *
 * The hook is intentionally subscription-light: it reads `useRoute()`'s
 * primary path and returns a memoized result. The route change triggers a
 * re-render through the router context; this hook adds no separate listener.
 */

import { useMemo } from '@wordpress/element';

import { useRoute } from '../routing/router';
import { useKernel } from '../kernel-context';
import { resolveMode } from './resolveMode.mjs';
import { matchPattern } from '../routing/matchRoute.mjs';

const EMPTY = Object.freeze( {
	modal: false,
	regions: {},
	modeId: 'default',
	screenId: null,
} );

/**
 * Resolve the active chrome mode for the URL-matched screen.
 *
 * @return {{ modal: boolean, regions: Object|null, modeId: string, screenId: string|null }} Resolved mode state for Region.js to consume.
 */
export function useMode() {
	const { config } = useKernel();
	const { primary } = useRoute();

	// Catalog lives on window — populated by PHP at script-attach time. In
	// tests / Storybook, fixtures may stash a catalog on `config.engineModes`
	// directly; check that path too so tests don't need to write the window
	// global.
	const engineModes =
		config &&
		typeof config === 'object' &&
		config.engineModes &&
		typeof config.engineModes === 'object'
			? config.engineModes
			: ( typeof window !== 'undefined' &&
					window.wpAdminWorkspaces?.engineModes ) ||
			  null;

	const screens =
		config && typeof config.screens === 'object' && config.screens !== null
			? config.screens
			: null;

	return useMemo( () => {
		if ( ! engineModes || ! screens ) {
			return EMPTY;
		}
		const screenId = findScreenForPath( primary || '', screens );
		if ( ! screenId ) {
			return EMPTY;
		}
		const resolved = resolveMode( screenId, engineModes, screens );
		return { ...resolved, screenId };
	}, [ engineModes, screens, primary ] );
}

/**
 * Find the screen whose `path` matches the current URL primary path.
 * Most-specific-wins: literal segments outscore param segments; longer
 * literal-prefix wins ties. Mirrors the routing-table scoring.
 *
 * @param {string} primaryPath URL primary path (e.g. `/posts/42/edit`).
 * @param {Object} screens     Map of screen-id → screen doc.
 * @return {string|null} Matched screen id, or null when nothing matches.
 */
function findScreenForPath( primaryPath, screens ) {
	if ( ! primaryPath ) {
		return null;
	}
	let best = null;
	let bestScore = -1;
	for ( const [ id, screen ] of Object.entries( screens ) ) {
		if (
			! screen ||
			typeof screen !== 'object' ||
			typeof screen.path !== 'string'
		) {
			continue;
		}
		const match = matchPattern( screen.path, primaryPath );
		if ( ! match ) {
			continue;
		}
		const score = scorePath( screen.path );
		if ( score > bestScore ) {
			best = id;
			bestScore = score;
		}
	}
	return best;
}

function scorePath( pattern ) {
	// Literal characters (anything not inside curly braces or `*`) score
	// 2; param segments score 1; wildcard suffix scores 0. Mirrors the
	// matchRoute.mjs spirit of literal > param > wildcard.
	let score = 0;
	let inParam = false;
	for ( const ch of pattern ) {
		if ( ch === '{' ) {
			inParam = true;
			continue;
		}
		if ( ch === '}' ) {
			inParam = false;
			score += 1;
			continue;
		}
		if ( inParam ) {
			continue;
		}
		if ( ch === '*' ) {
			continue;
		}
		score += 2;
	}
	return score;
}
