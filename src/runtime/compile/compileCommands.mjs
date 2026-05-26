/**
 * Normalize the `commands[]` block: dedupe by `id` (later wins, matching
 * cascade semantics). v3 commands always declare an `id`; an entry missing
 * one gets a stable index-derived id so cascade lookup still works.
 *
 * @param {Array} commands Resolved commands array.
 * @return {Array} Deduped commands.
 */
export function compileCommands( commands ) {
	const list = Array.isArray( commands ) ? commands : [];
	const byId = new Map();
	let anon = 0;
	for ( const cmd of list ) {
		if ( ! cmd || typeof cmd !== 'object' ) {
			continue;
		}
		let entry = cmd;
		let id = typeof cmd.id === 'string' && cmd.id !== '' ? cmd.id : '';
		if ( id === '' ) {
			id = `cmd-${ anon++ }`;
			entry = { ...cmd, id };
		}
		byId.set( id, entry );
	}
	return Array.from( byId.values() );
}
