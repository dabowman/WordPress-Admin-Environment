import { resolveIcon } from '../../../runtime/config/iconMap';
import { compileEligibility } from './compileEligibility.mjs';

/**
 * Shared DataViews action compiler for the entity-CRUD apps.
 *
 * Every app compiles the same action shape — `{ id, label, isPrimary,
 * supportsBulk, icon, isEligible }` — then attaches EITHER a `RenderModal`
 * (confirmation / detail modals) OR a `callback` (fire-and-go actions). The
 * differences are entirely in the data passed in:
 *
 * - `labels`               — ACTION_LABELS table (id → translated label).
 * - `callbacks`            — id → `(items) => void` for simple actions.
 * - `modals`               — id → `RenderModal` component; wins over callbacks.
 * - `eligibilityOverrides` — id → `(item) => boolean` for presence checks
 *                            JSON `eligibleWhen` can't express (e.g. plugins'
 *                            "has a plugin URI"). Wins over the declarative
 *                            `compileEligibility(spec.eligibleWhen)`.
 *
 * Unknown ids fall through to `spec.label` so cascade-contributed actions keep
 * their authored strings.
 *
 * @param {Array}  actionSpecs                    View-config action specs.
 * @param {Object} [options]
 * @param {Object} [options.labels]
 * @param {Object} [options.callbacks]
 * @param {Object} [options.modals]
 * @param {Object} [options.eligibilityOverrides]
 * @return {Array} Compiled DataViews actions.
 */
export function buildActions(
	actionSpecs,
	{ labels = {}, callbacks = {}, modals = {}, eligibilityOverrides = {} } = {}
) {
	return ( actionSpecs ?? [] )
		.filter( ( spec ) => spec && typeof spec === 'object' && spec.id )
		.map( ( spec ) => {
			const compiled = {
				id: spec.id,
				label: labels[ spec.id ] ?? spec.label,
				isPrimary: !! spec.isPrimary,
				supportsBulk: !! spec.supportsBulk,
				icon: spec.icon ? resolveIcon( spec.icon ) : undefined,
				isEligible:
					eligibilityOverrides[ spec.id ] ??
					compileEligibility( spec.eligibleWhen ),
			};

			if ( modals[ spec.id ] ) {
				compiled.RenderModal = modals[ spec.id ];
			} else if ( callbacks[ spec.id ] ) {
				compiled.callback = callbacks[ spec.id ];
			}

			return compiled;
		} );
}
