/**
 * Parse a `@wordpress/keyboard-shortcuts`-style shortcut string into
 * a matcher predicate over a `KeyboardEvent`.
 *
 * Supported syntax (spec §8 + the workspace.json schema’s `binding.shortcut` regex):
 *   Mod+K            — primary modifier (Cmd on macOS, Ctrl elsewhere)
 *   Shift+Mod+P
 *   Alt+ArrowDown
 *   Mod+/            (special case — `/` is a single-char key name)
 *
 * Modifier tokens:  Mod, Shift, Alt, Ctrl, Meta
 * Key tokens:       single-char letters/digits, named keys
 *                   (ArrowUp, Escape, F1, Slash, …)
 *
 * Pure ESM. Tests in tests/runtime/bindings.test.mjs.
 */

const MOD_TOKENS = new Set( [ 'Mod', 'Shift', 'Alt', 'Ctrl', 'Meta' ] );

/**
 * Detect the platform's primary modifier. The workspace runs in browsers,
 * so window.navigator.platform is the right signal. Tests can override
 * by passing a second argument.
 */
function isMac() {
	if ( typeof window === 'undefined' || ! window.navigator ) {
		return false;
	}
	const platform = window.navigator.platform || '';
	const userAgent = window.navigator.userAgent || '';
	return /Mac|iPad|iPhone|iPod/.test( platform ) || /Mac/.test( userAgent );
}

/**
 * Returns a predicate `(event) => boolean` matching the shortcut.
 *
 * Optionally pass `{ mac: boolean }` to override platform detection
 * (test paths use this to avoid coupling to the host).
 */
export function parseShortcut( shortcut, options = {} ) {
	if ( typeof shortcut !== 'string' || shortcut.length === 0 ) {
		return null;
	}
	const tokens = shortcut.split( '+' );
	if ( tokens.length === 0 ) {
		return null;
	}

	const mac = options.mac !== undefined ? !! options.mac : isMac();

	let needShift = false;
	let needAlt = false;
	let needCtrl = false;
	let needMeta = false;
	let key = null;

	for ( const token of tokens ) {
		if ( ! token ) {
			return null;
		}
		if ( MOD_TOKENS.has( token ) ) {
			if ( token === 'Mod' ) {
				if ( mac ) {
					needMeta = true;
				} else {
					needCtrl = true;
				}
			} else if ( token === 'Shift' ) {
				needShift = true;
			} else if ( token === 'Alt' ) {
				needAlt = true;
			} else if ( token === 'Ctrl' ) {
				needCtrl = true;
			} else if ( token === 'Meta' ) {
				needMeta = true;
			}
			continue;
		}
		// Key tokens: single chars are case-insensitive; named keys are
		// matched against `event.key` directly.
		key = token;
	}

	if ( ! key ) {
		return null;
	}

	const keyLower = key.length === 1 ? key.toLowerCase() : key;

	return function matches( event ) {
		if ( ! event ) {
			return false;
		}
		if ( !! event.shiftKey !== needShift ) {
			return false;
		}
		if ( !! event.altKey !== needAlt ) {
			return false;
		}
		if ( !! event.ctrlKey !== needCtrl ) {
			return false;
		}
		if ( !! event.metaKey !== needMeta ) {
			return false;
		}
		const eventKey = event.key || '';
		if ( keyLower.length === 1 ) {
			// On macOS the Option/Alt modifier rewrites event.key to a
			// composed glyph (e.g. `Cmd+Alt+N` → event.key === "˜").
			// event.code is layout-independent (always `KeyN` for the N
			// physical key) so prefer it when the modifier set involves
			// Alt. Letters only.
			if ( eventKey.toLowerCase() === keyLower ) {
				return true;
			}
			if ( /^[a-z]$/.test( keyLower ) ) {
				const eventCode = event.code || '';
				return eventCode === 'Key' + keyLower.toUpperCase();
			}
			return false;
		}
		return eventKey === keyLower;
	};
}
