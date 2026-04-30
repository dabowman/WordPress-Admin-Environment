/**
 * Source registry — single mutable map keyed by `id`.
 *
 * The runtime uses one registry instance per kernel mount. Sources are
 * added via `register()`; the kernel then resolves config-declared
 * references through `get()` (kind-checked) or the looser `find()`.
 */

const VALID_KINDS = new Set( [ 'app', 'region', 'engine' ] );

export function createRegistry() {
	const sources = new Map();

	function register( source ) {
		if ( ! source || typeof source !== 'object' ) {
			throw new Error( 'createRegistry: register() requires a source object' );
		}
		if ( ! source.id || typeof source.id !== 'string' ) {
			throw new Error( 'createRegistry: source.id must be a non-empty string' );
		}
		if ( ! VALID_KINDS.has( source.kind ) ) {
			throw new Error(
				`createRegistry: invalid kind "${ source.kind }" for source "${ source.id }"`
			);
		}
		if ( sources.has( source.id ) ) {
			throw new Error(
				`createRegistry: duplicate source id "${ source.id }"`
			);
		}
		sources.set( source.id, source );
		return source;
	}

	function get( id, kind ) {
		const source = sources.get( id );
		if ( ! source ) {
			return null;
		}
		if ( kind && source.kind !== kind ) {
			return null;
		}
		return source;
	}

	function find( id ) {
		return sources.get( id ) || null;
	}

	function list( kind ) {
		const all = Array.from( sources.values() );
		return kind ? all.filter( ( s ) => s.kind === kind ) : all;
	}

	function has( id ) {
		return sources.has( id );
	}

	return { register, get, find, list, has };
}
