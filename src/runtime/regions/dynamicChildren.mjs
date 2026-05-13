/**
 * Runtime-mutated child regions (spec §5.5 — `core:dynamic-children`
 * platform service).
 *
 * A region whose template declares
 * `platform[ 'core:dynamic-children' ]: true` becomes a host for child
 * regions added/removed at runtime by its mounted app (typically a
 * compositor). The kernel renders dynamic children through the same
 * `<Region>` recursion as static `region.regions[]`, so they inherit
 * every kernel service keyed by region ID — routing slot, dirty-state,
 * trigger registration, capability gating, ARIA roles, theming scope.
 *
 * Pure ESM, framework-agnostic. The kernel instantiates one store per
 * mount via `createDynamicChildrenStore({ validate })` and hangs it off
 * `KernelContext`. React surfaces (`useDynamicChildren`) subscribe via
 * `useSyncExternalStore`.
 *
 * `add()` runs the caller-supplied `validate(decl)` (typically
 * `validateRegion` from `./validateRegion.mjs`) and throws on violations,
 * keeping the dynamic-child surface honest about spec §5.4 invariants
 * (`app` xor `routing.route-key`).
 *
 * Snapshot stability matters for `useSyncExternalStore`: the same array
 * reference is returned between mutations. Mutating `add`/`remove`
 * rebuilds the snapshot and fans out to subscribers. Empty parents share
 * a single frozen `EMPTY` array.
 */

const EMPTY = Object.freeze( [] );

export function createDynamicChildrenStore( { validate } = {} ) {
	const byParent = new Map(); // parentId -> Map(key -> decl)
	const snapshots = new Map(); // parentId -> cached array (stable ref)
	const listeners = new Map(); // parentId -> Set<fn>

	function rebuildSnapshot( parentId ) {
		const map = byParent.get( parentId );
		if ( ! map || map.size === 0 ) {
			snapshots.set( parentId, EMPTY );
			return;
		}
		snapshots.set(
			parentId,
			Array.from( map.entries() ).map( ( [ key, decl ] ) => ( {
				key,
				decl,
			} ) )
		);
	}

	function notify( parentId ) {
		rebuildSnapshot( parentId );
		const set = listeners.get( parentId );
		if ( ! set ) {
			return;
		}
		for ( const fn of set ) {
			fn();
		}
	}

	function add( parentId, key, decl ) {
		if ( typeof parentId !== 'string' || ! parentId ) {
			throw new TypeError(
				'dynamicChildren.add: parentId must be a non-empty string'
			);
		}
		if ( typeof key !== 'string' || ! key ) {
			throw new TypeError(
				'dynamicChildren.add: key must be a non-empty string'
			);
		}
		if ( ! decl || typeof decl !== 'object' ) {
			throw new TypeError(
				'dynamicChildren.add: decl must be a region object'
			);
		}
		if ( typeof validate === 'function' ) {
			const violations = validate( decl );
			if ( Array.isArray( violations ) && violations.length > 0 ) {
				const first = violations[ 0 ];
				throw new Error(
					`dynamicChildren.add(${ parentId }/${ key }): ${
						first.message || first.rule || 'invalid region'
					}`
				);
			}
		}
		let map = byParent.get( parentId );
		if ( ! map ) {
			map = new Map();
			byParent.set( parentId, map );
		}
		map.set( key, decl );
		notify( parentId );
	}

	function remove( parentId, key ) {
		const map = byParent.get( parentId );
		if ( ! map ) {
			return false;
		}
		const had = map.delete( key );
		if ( had ) {
			notify( parentId );
		}
		return had;
	}

	function list( parentId ) {
		if ( ! snapshots.has( parentId ) ) {
			rebuildSnapshot( parentId );
		}
		return snapshots.get( parentId );
	}

	function subscribe( parentId, listener ) {
		if ( typeof listener !== 'function' ) {
			throw new TypeError(
				'dynamicChildren.subscribe: listener must be a function'
			);
		}
		let set = listeners.get( parentId );
		if ( ! set ) {
			set = new Set();
			listeners.set( parentId, set );
		}
		set.add( listener );
		return () => {
			const cur = listeners.get( parentId );
			if ( ! cur ) {
				return;
			}
			cur.delete( listener );
			if ( cur.size === 0 ) {
				listeners.delete( parentId );
			}
		};
	}

	return { add, remove, list, subscribe };
}
