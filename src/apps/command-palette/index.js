import { useCallback, useMemo } from '@wordpress/element';
import { useCommandLoader } from '@wordpress/commands';
import { __, sprintf } from '@wordpress/i18n';

import { resolveIcon } from '../../runtime/config/iconMap';
import { useKernel } from '../../runtime/kernel-context';
import { navigate } from '../../runtime/routing/router';
import { trigger } from '../../runtime/bindings/triggerStore.mjs';

/**
 * core:command-palette — registers shell-aware commands with
 * `@wordpress/commands` so the package's portal palette (Mod+K) can
 * surface them. The palette UI itself is owned by the commands
 * package; this app contributes the command set + does not render UI.
 *
 * Two sources feed the palette in v3:
 *   1. `config.commands[]` — labelled first-class commands (the v3
 *      replacement for v2's `bindings` array). Each entry with a
 *      `label` becomes a palette entry; callback fires `invoke`
 *      then `navigate` in the same order `BindingsConsumer` uses
 *      for keyboard shortcuts.
 *   2. `config.screens[]` — every screen with a `path` + `label`
 *      becomes a "Go to <label>" entry, minus screens that are
 *      already covered by a `commands[]` entry pointing at the same
 *      path. Hidden screens + parameterized paths (`{id}`) skipped.
 */
export default function CommandPaletteApp() {
	const { config } = useKernel();
	const commandsBlock = Array.isArray( config?.commands )
		? config.commands
		: null;
	const screensBlock =
		config?.screens && typeof config.screens === 'object'
			? config.screens
			: null;

	const commands = useMemo( () => {
		const out = [];
		const seenPaths = new Set();
		const seenNames = new Set();

		// 1. First-class commands. Labelled entries surface in the palette;
		//    keyboard-only commands (no label) are handled by
		//    BindingsConsumer and never appear here.
		if ( commandsBlock ) {
			for ( const entry of commandsBlock ) {
				if (
					! entry ||
					typeof entry !== 'object' ||
					typeof entry.id !== 'string' ||
					typeof entry.label !== 'string' ||
					entry.label === ''
				) {
					continue;
				}
				const hasInvoke =
					typeof entry.invoke === 'string' && entry.invoke !== '';
				const hasNavigate =
					typeof entry.navigate === 'string' && entry.navigate !== '';
				if ( ! hasInvoke && ! hasNavigate ) {
					continue;
				}
				const name = `core/admin-shell/command-${ encodeURIComponent(
					entry.id
				) }`;
				seenNames.add( name );
				if ( hasNavigate ) {
					seenPaths.add( entry.navigate );
				}
				out.push( {
					name,
					label: entry.label,
					icon: resolveIcon( entry.icon ),
					callback: ( { close } ) => {
						let handled = false;
						if ( hasInvoke ) {
							handled = trigger( entry.invoke );
						}
						if ( ! handled && hasNavigate ) {
							navigate( entry.navigate );
						}
						close();
					},
				} );
			}
		}

		// 2. "Go to X" entries synthesized from `screens[]`. Hidden /
		//    palette-mounted / parameterized screens skipped; screens
		//    already covered by a `commands[]` entry skipped to avoid
		//    duplicate palette listings.
		if ( screensBlock ) {
			for ( const [ screenId, screen ] of Object.entries(
				screensBlock
			) ) {
				if ( ! screen || typeof screen !== 'object' ) {
					continue;
				}
				const path =
					typeof screen.path === 'string' && screen.path !== ''
						? screen.path
						: '';
				if ( ! path ) {
					continue;
				}
				if ( screen.hidden === true ) {
					continue;
				}
				// Parameterized paths can't be navigated to from a
				// palette pick — the captured params have no value.
				if ( path.includes( '{' ) || path.endsWith( '/*' ) ) {
					continue;
				}
				if ( seenPaths.has( path ) ) {
					continue;
				}
				const label =
					typeof screen.label === 'string' && screen.label !== ''
						? sprintf(
								/* translators: %s: screen label */
								__( 'Go to %s', 'wp-admin-shell' ),
								screen.label
						  )
						: sprintf(
								/* translators: %s: screen path */
								__( 'Go to %s', 'wp-admin-shell' ),
								path
						  );
				const name = `core/admin-shell/goto-${ encodeURIComponent(
					screenId
				) }`;
				if ( seenNames.has( name ) ) {
					continue;
				}
				seenNames.add( name );
				out.push( {
					name,
					label,
					icon: resolveIcon( screen.icon ),
					callback: ( { close } ) => {
						navigate( path );
						close();
					},
				} );
			}
		}

		return out;
	}, [ commandsBlock, screensBlock ] );

	const hook = useCallback(
		() => ( { commands, isLoading: false } ),
		[ commands ]
	);

	useCommandLoader( {
		name: 'core/admin-shell/apps',
		hook,
	} );

	return null;
}
