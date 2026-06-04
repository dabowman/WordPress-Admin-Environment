import { useState } from '@wordpress/element';
import { store as coreStore } from '@wordpress/core-data';
import { useDispatch, useSelect } from '@wordpress/data';
import { store as noticesStore } from '@wordpress/notices';
import { DataForm } from '@wordpress/dataviews/wp';
import { Button, Stack, Text } from '@wordpress/ui';
import { _n, sprintf, __ } from '@wordpress/i18n';
import {
	computeBulkPayload,
	resolveBulkTargets,
	NO_CHANGE,
} from './bulkEditPayload.mjs';

/**
 * The shared host for **Bulk Edit** — apply a chosen subset of fields to the M
 * selected rows (deliverable #2 of the DataViews interaction-pattern library —
 * see `docs/dataviews-interaction-patterns.md`). It is the shell-side substitute
 * for the upstream bulk-edit-form (#165) / editable-cell (#162) primitives:
 * when those land we swap the host, not the logic.
 *
 * `createBulkEditModal` returns a DataViews `RenderModal`-compatible component,
 * wired into a list app through the `buildActions` `modals` map:
 *
 * ```js
 * const bulkEdit = createBulkEditModal( { entity: [ 'postType', 'post' ], fields, form } );
 * const actions  = buildActions( specs, { modals: { 'bulk-edit': bulkEdit } } );
 * ```
 * The action must declare `supportsBulk: true` so DataViews offers it for a
 * multi-row selection.
 *
 * **How it works.** Every field is seeded to a per-field **"— No change —"**
 * sentinel; the user sets only the fields they want to change. On Apply, the
 * pure `computeBulkPayload` reduces the live form to just the changed fields,
 * and a `Promise.allSettled` fans `saveEntityRecord( kind, name, { id,
 * ...payload } )` across the selection — mirroring `createBulkConfirmModal`'s
 * partial-failure reporting (one row failing doesn't collapse the rest) and
 * `onActionPerformed` (only the rows that actually saved are reported, so the
 * failed ones stay selected for a retry).
 *
 * **Field-agnostic.** It renders whatever `fields` / `form` the caller passes
 * and owns no entity knowledge. The caller is responsible for giving every
 * editable field a `setValue`/`getValue` (or default) that treats the sentinel
 * as "leave unset" — `fieldsWithNoChange` is a convenience for the common
 * `elements`-backed case (status / role): it prepends a `— No change —` option
 * and seeds the form value to the sentinel.
 *
 * @param {Object}   config
 * @param {Array}    config.entity        Entity coords `[ kind, name ]` spread into `saveEntityRecord` (e.g. `[ 'postType', 'post' ]`).
 * @param {Array}    config.fields        `DataForm` field definitions. Each editable field must accept + round-trip the sentinel as its "no change" value.
 * @param {Object}   config.form          `DataForm` layout config (`regular` / `panel` / `sections`).
 * @param {*}        [config.sentinel]    The per-field "no change" marker. Defaults to the shared `NO_CHANGE`. Must be a value the real field domain never produces.
 * @param {Function} [config.toRecord]    `(payload, item) => restBody` maps the changed-field payload to the per-item REST body. Defaults to identity. The `id` is always merged in afterwards, so `toRecord` need not (and should not) set it.
 * @param {Object}   [config.messages]    `{ applyLabel, saved, partial, error, empty, noTargets }` copy. `saved`/`partial` may be `(n, failed) => string`. The modal *header* is NOT set here — DataViews' internal `ActionModal` already wraps this `RenderModal` in its own `<Modal>` and titles it from the action's `label` / `modalHeader`. Returning our own `<Modal>` (or passing a `title`) would double the overlay, header, and focus trap, so the consumer sets the action label instead (matching `createBulkConfirmModal`).
 * @param {Function} [config.filterItems] `(items) => targets` optional target filter applied before the batch (e.g. users' self-demote guard). Defaults to identity. When it leaves zero targets, Apply short-circuits to an info notice (`messages.noTargets`) + `closeModal()` instead of firing an empty `Promise.allSettled` (which would settle with `failed === 0` and fire a misleading "updated 0 items" success).
 * @param {Function} [config.onApplied]   `({ items, succeeded, results, failed }) => void` after the batch settles — e.g. `invalidateResolution` for the list cache. Runs even when nothing changed (failed = 0). `items` is the FILTERED target set.
 * @return {Function} A DataViews `RenderModal` component.
 */
export function createBulkEditModal( {
	entity,
	fields,
	form,
	sentinel = NO_CHANGE,
	toRecord,
	messages = {},
	filterItems,
	onApplied,
} ) {
	const [ kind, name ] = entity;
	const mapToRecord =
		typeof toRecord === 'function' ? toRecord : ( payload ) => payload;

	const applyLabel =
		messages.applyLabel || __( 'Apply', 'wp-admin-workspaces' );

	/**
	 * Seed the form: every field starts at the "no change" sentinel.
	 *
	 * The sentinel only round-trips cleanly through `elements`-backed controls,
	 * because `fieldsWithNoChange` injects a matching `— No change —` option for
	 * those (selects: status / role / comment-status) and the select then renders
	 * that option as "unchanged." A plain text / integer / date field seeded here
	 * would render the literal sentinel string in its input — so any non-`elements`
	 * bulk field needs a custom `getValue`/`setValue` (or placeholder-style control)
	 * that treats the sentinel as empty. The caller owns that mapping (see the
	 * `config.fields` docstring above); `fieldsWithNoChange` only covers the common
	 * `elements` case.
	 */
	const seed = () => {
		const data = {};
		for ( const field of fields ?? [] ) {
			if ( field && field.id ) {
				data[ field.id ] = sentinel;
			}
		}
		return data;
	};

	return function BulkEditModal( { items, closeModal, onActionPerformed } ) {
		const [ data, setData ] = useState( seed );
		const [ isBusy, setIsBusy ] = useState( false );
		const { saveEntityRecord } = useDispatch( coreStore );
		const { createSuccessNotice, createErrorNotice, createInfoNotice } =
			useDispatch( noticesStore );
		const getLastEntitySaveError = useSelect(
			( select ) => select( coreStore ).getLastEntitySaveError,
			[]
		);

		// `filterItems` strips rows the caller never wants written (e.g. the
		// acting user, for the self-demote guard) BEFORE the batch — so the
		// excluded rows stay selected but are never saved, and an all-excluded
		// selection short-circuits rather than firing an empty batch that would
		// report a phantom "0 items updated" success.
		const targets = resolveBulkTargets( items, filterItems );
		const count = targets.length;
		const payload = computeBulkPayload( data, sentinel );
		const hasChanges = Object.keys( payload ).length > 0;

		// No client-side `useFormValidity` gate (unlike the sibling
		// `EntityFormModal`): bulk edit seeds EVERY field to the sentinel, so a
		// straight validity pass would flag required/typed fields as invalid
		// *because* they hold the sentinel and would wrongly disable Apply. Every
		// field here is optional-by-sentinel — only the ones changed away from it
		// are written — so there is nothing to require. Out-of-domain values are
		// caught server-side and surfaced through the partial-failure notice
		// (`%1$d updated, %2$d failed.`). A future inline gate would have to skip
		// any field still equal to the sentinel.

		const onApply = async () => {
			if ( isBusy ) {
				return;
			}
			// All selected rows were filtered out (e.g. the only selection was
			// the acting user, stripped by the self-demote guard). Fire an info
			// notice + close instead of an empty `Promise.allSettled` that would
			// settle `failed === 0` → a misleading "0 items updated" success.
			if ( ! targets.length ) {
				createInfoNotice(
					messages.noTargets ||
						__( 'No users to update.', 'wp-admin-workspaces' ),
					{ isDismissible: true }
				);
				closeModal();
				return;
			}
			// Defensive only: the Apply button is `disabled` on `! hasChanges`
			// (below), so this guard + `messages.empty` notice is unreachable
			// through normal UI interaction — it just keeps `onApply` safe if a
			// caller ever invokes it programmatically with no changes staged.
			if ( ! hasChanges ) {
				createErrorNotice(
					messages.empty ||
						__( 'Set a field to apply.', 'wp-admin-workspaces' ),
					{ isDismissible: true }
				);
				return;
			}
			setIsBusy( true );
			// `finally` clears the busy flag even if a caller-supplied
			// `onApplied` / `onActionPerformed` throws after the batch — else the
			// modal stays open with the Apply button stuck disabled.
			// (`Promise.allSettled` itself never rejects.)
			try {
				const results = await Promise.allSettled(
					targets.map( ( item ) => {
						const body = {
							...mapToRecord( payload, item ),
							id: item.id,
						};
						return saveEntityRecord( kind, name, body ).then(
							( record ) => {
								// `saveEntityRecord` RESOLVES `undefined` on a REST
								// failure (it doesn't throw) — reject so it counts
								// as a failure rather than a phantom success.
								if ( ! record ) {
									const saveError = getLastEntitySaveError(
										kind,
										name,
										item.id
									);
									throw new Error(
										saveError?.message ||
											messages.error ||
											__(
												'Failed to update.',
												'wp-admin-workspaces'
											)
									);
								}
								return record;
							}
						);
					} )
				);

				const failed = results.filter(
					( r ) => r.status === 'rejected'
				).length;
				// Only the rows that actually saved are "performed"; reporting the
				// failures would deselect rows the user likely wants to retry.
				const succeeded = targets.filter(
					( _item, i ) => results[ i ]?.status === 'fulfilled'
				);
				const ok = succeeded.length;

				if ( failed === 0 ) {
					createSuccessNotice(
						typeof messages.saved === 'function'
							? messages.saved( ok, 0 )
							: messages.saved ||
									sprintf(
										/* translators: %d: number of items updated. */
										_n(
											'%d item updated.',
											'%d items updated.',
											ok,
											'wp-admin-workspaces'
										),
										ok
									),
						{ type: 'snackbar' }
					);
				} else {
					createErrorNotice(
						typeof messages.partial === 'function'
							? messages.partial( ok, failed )
							: messages.partial ||
									sprintf(
										/* translators: 1: number updated, 2: number that failed. */
										__(
											'%1$d updated, %2$d failed.',
											'wp-admin-workspaces'
										),
										ok,
										failed
									),
						{ isDismissible: true }
					);
				}

				onApplied?.( { items: targets, succeeded, results, failed } );
				onActionPerformed?.( succeeded );
				// Close only on full success; mirrors `EntityFormModal`'s
				// keep-open-on-failure intent. On a partial / total failure the
				// failed rows stay selected and the staged field values survive,
				// so the user can correct + retry without re-entering everything.
				if ( failed === 0 ) {
					closeModal();
				}
			} finally {
				setIsBusy( false );
			}
		};

		// Bare `<Stack>` — NO own `<Modal>`. DataViews' internal `ActionModal`
		// already wraps this `RenderModal` in a `<Modal>` (titled from the
		// action's `label` / `modalHeader`), so wrapping our own would double the
		// overlay / header / focus trap. Mirrors `createBulkConfirmModal`.
		return (
			<Stack direction="column" gap="md">
				<Text>
					{ sprintf(
						/* translators: %d: number of selected items. */
						_n(
							'Editing %d item.',
							'Editing %d items.',
							count,
							'wp-admin-workspaces'
						),
						count
					) }
				</Text>
				<DataForm
					data={ data }
					fields={ fields }
					form={ form }
					onChange={ ( edits ) =>
						setData( ( prev ) => ( { ...prev, ...edits } ) )
					}
				/>
				<Stack direction="row" justify="flex-end" gap="sm">
					<Button
						tone="neutral"
						variant="minimal"
						onClick={ closeModal }
					>
						{ __( 'Cancel', 'wp-admin-workspaces' ) }
					</Button>
					<Button
						tone="brand"
						variant="solid"
						onClick={ onApply }
						loading={ isBusy }
						disabled={ ! hasChanges || isBusy }
					>
						{ applyLabel }
					</Button>
				</Stack>
			</Stack>
		);
	};
}

/**
 * Convenience for the common `elements`-backed bulk field (status / role /
 * comment-status): prepend a `— No change —` option whose value is the sentinel
 * so the field round-trips "leave unset" through `computeBulkPayload`. Pass
 * `fieldsWithNoChange( fields, { ids: [ 'status', 'role' ], sentinel } )` to mark
 * which fields get the sentinel option; others are left untouched.
 *
 * Field defs the caller already authored with a sentinel option are left as-is
 * (the function only adds the option to ids in `ids` that don't already carry
 * the sentinel value).
 *
 * @param {Array}  fields             `DataForm` field definitions.
 * @param {Object} [options]
 * @param {Array}  [options.ids]      Field ids to add the sentinel option to. Defaults to every field that has `elements`.
 * @param {*}      [options.sentinel] The sentinel value. Defaults to `NO_CHANGE`.
 * @param {string} [options.label]    The sentinel option label. Defaults to `— No change —`.
 * @return {Array} A new field array with the sentinel option prepended where applicable.
 */
export function fieldsWithNoChange(
	fields,
	{ ids, sentinel = NO_CHANGE, label } = {}
) {
	const noChangeLabel = label || __( '— No change —', 'wp-admin-workspaces' );
	const option = { value: sentinel, label: noChangeLabel };
	return ( fields ?? [] ).map( ( field ) => {
		if ( ! field || ! field.id || ! Array.isArray( field.elements ) ) {
			return field;
		}
		const apply = ids ? ids.includes( field.id ) : true;
		if ( ! apply ) {
			return field;
		}
		const already = field.elements.some( ( el ) => el?.value === sentinel );
		if ( already ) {
			return field;
		}
		return { ...field, elements: [ option, ...field.elements ] };
	} );
}
