/**
 * Pure command-palette compiler. Walks v3 `config.commands[]` + the
 * `config.screens[]` map and emits a flat list of palette descriptors
 * (`{ name, label, icon, source: 'command'|'screen', action }`). React
 * UI layer wires the descriptors into `@wordpress/commands` via
 * `useCommandLoader`; this module is dependency-free so it tests on a
 * bare Node runtime.
 *
 * Two sources, processed in order:
 *
 *   1. **commands[]** — labelled first-class commands. Entries must
 *      carry `id`, `label`, and at least one of `invoke` / `navigate`.
 *      Keyboard-only commands (no `label`) are skipped — the keystroke
 *      path is owned by `BindingsConsumer`, not the palette.
 *
 *   2. **screens[]** — every non-hidden screen with a `path` + `label`
 *      becomes a "Go to <label>" entry. Hidden screens skipped
 *      (`hidden: true`). Parameterized paths (`{id}` / `/*`) skipped —
 *      captured params have no value at palette pick. Screens already
 *      covered by a `commands[]` `navigate` are skipped (dedup by
 *      path).
 *
 * Two dedup layers stack on top:
 *
 *   - **dedup by path** — both `commands[].navigate` and
 *     `screens[id].path` are URL paths. A command pointing at
 *     `/posts/new` suppresses the screen entry pointing at the same
 *     path. Path is the canonical identity.
 *   - **dedup by emitted `name`** — all palette names use the unified
 *     `core/admin-shell/palette-<id>` prefix. The id encodes the
 *     source (command id vs screen id), so the prefix collision check
 *     catches duplicate ids across sources too (a screen whose id
 *     matches a command id wins for the command — first-write wins).
 *
 * `goToLabel` is the localized "Go to <target>" wrapper. The React
 * layer passes `(target) => sprintf(__('Go to %s', 'wp-admin-workspaces'),
 * target)` so the `wp-i18n` literal-string check sees the literal at
 * the React call site. Tests pass an identity wrapper that returns
 * `'Go to ' + target` for deterministic, locale-agnostic assertions.
 *
 * @param {Object}   inputs
 * @param {Array|null|undefined} inputs.commands   `config.commands[]` from the resolved cascade tree, or null.
 * @param {Object|null|undefined} inputs.screens   `config.screens` map, or null.
 * @param {(target: string) => string} inputs.goToLabel  Localized "Go to <target>" wrapper.
 * @returns {Array<{ name: string, label: string, icon: string|null, source: 'command'|'screen', action: { kind: 'invoke', appId: string }|{ kind: 'navigate', path: string }|{ kind: 'compound', invoke: string, navigate: string } }>}
 */
export function compileCommands( { commands, screens, goToLabel } ) {
	const out = [];
	const seenPaths = new Set();
	const seenNames = new Set();

	if ( Array.isArray( commands ) ) {
		for ( const entry of commands ) {
			if (
				! entry ||
				typeof entry !== 'object' ||
				typeof entry.id !== 'string' ||
				entry.id === '' ||
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
			const name = `core/admin-shell/palette-${ encodeURIComponent(
				entry.id
			) }`;
			if ( seenNames.has( name ) ) {
				continue;
			}
			seenNames.add( name );
			if ( hasNavigate ) {
				seenPaths.add( entry.navigate );
			}
			let action;
			if ( hasInvoke && hasNavigate ) {
				action = {
					kind: 'compound',
					invoke: entry.invoke,
					navigate: entry.navigate,
				};
			} else if ( hasInvoke ) {
				action = { kind: 'invoke', appId: entry.invoke };
			} else {
				action = { kind: 'navigate', path: entry.navigate };
			}
			out.push( {
				name,
				label: entry.label,
				icon: typeof entry.icon === 'string' ? entry.icon : null,
				source: 'command',
				action,
			} );
		}
	}

	if ( screens && typeof screens === 'object' ) {
		for ( const [ screenId, screen ] of Object.entries( screens ) ) {
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
			if ( path.includes( '{' ) || path.endsWith( '/*' ) ) {
				continue;
			}
			if ( seenPaths.has( path ) ) {
				continue;
			}
			const name = `core/admin-shell/palette-${ encodeURIComponent(
				screenId
			) }`;
			if ( seenNames.has( name ) ) {
				continue;
			}
			seenNames.add( name );
			seenPaths.add( path );
			const labelSource =
				typeof screen.label === 'string' && screen.label !== ''
					? screen.label
					: path;
			out.push( {
				name,
				label: goToLabel( labelSource ),
				icon: typeof screen.icon === 'string' ? screen.icon : null,
				source: 'screen',
				action: { kind: 'navigate', path },
			} );
		}
	}

	return out;
}
