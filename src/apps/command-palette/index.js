import { useCallback, useMemo } from '@wordpress/element';
import { useCommandLoader } from '@wordpress/commands';
import { __, sprintf } from '@wordpress/i18n';

import { resolveIcon } from '../../runtime/config/iconMap';
import { useKernel } from '../../runtime/kernel-context';
import { navigate } from '../../runtime/routing/router';
import { trigger } from '../../runtime/bindings/triggerStore.mjs';
import { compileCommands } from './compileCommands.mjs';

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
 *      for keyboard shortcuts. Keyboard-only commands (no label)
 *      stay out of the palette and are handled by the keystroke
 *      path alone.
 *   2. `config.screens[]` — every non-hidden screen with a `path` +
 *      `label` becomes a "Go to <label>" entry. Hidden screens
 *      skipped (`hidden: true`). Parameterized paths (`{id}` / `/*`)
 *      skipped. Screens already covered by a `commands[]` `navigate`
 *      pointing at the same path skipped to avoid duplicates.
 *
 * The pure-ESM compiler lives in `compileCommands.mjs` so the
 * branching logic (label-required filter, hasInvoke/hasNavigate gate,
 * path dedup, hidden skip, parameterized skip) is unit-testable on a
 * bare Node runtime. This file is the thin React wiring layer.
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
		const descriptors = compileCommands( {
			commands: commandsBlock,
			screens: screensBlock,
			goToLabel: ( target ) =>
				sprintf(
					/* translators: %s: screen label or path */
					__( 'Go to %s', 'wp-admin-workspaces' ),
					target
				),
		} );
		return descriptors.map( ( desc ) => ( {
			name: desc.name,
			label: desc.label,
			icon: desc.icon ? resolveIcon( desc.icon ) : undefined,
			callback: ( { close } ) => {
				const action = desc.action;
				let handled = false;
				if ( action.kind === 'invoke' || action.kind === 'compound' ) {
					const appId =
						action.kind === 'invoke' ? action.appId : action.invoke;
					handled = trigger( appId );
				}
				if (
					! handled &&
					( action.kind === 'navigate' || action.kind === 'compound' )
				) {
					navigate(
						action.kind === 'navigate'
							? action.path
							: action.navigate
					);
				}
				close();
			},
		} ) );
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
