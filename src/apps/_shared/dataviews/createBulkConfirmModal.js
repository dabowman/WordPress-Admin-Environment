import { Button, Stack, Text } from '@wordpress/ui';
import { Button as DestructiveButton } from '@wordpress/components';
import { useState } from '@wordpress/element';
import { __ } from '@wordpress/i18n';

/**
 * Build a DataViews `RenderModal` for a destructive bulk action — the
 * confirm-dialog scaffold every entity-CRUD app hand-rolled (Cancel +
 * destructive button, `Promise.allSettled` over the targets, failure count).
 *
 * Copy and post-mutation handling vary per app, so they're injected:
 *
 * - `getMessage( items, targets )` → confirmation copy (handles
 *   singular/plural and any skipped-item text).
 * - `confirmLabel` → destructive button text (string or `(targets) => string`).
 * - `mutate( item )` → per-item mutation Promise (delete / status change).
 * - `onSettled({ items, targets, results, failed })` → invalidate caches +
 *   surface success / partial-failure notices. App-owned so each entity keeps
 *   its exact messaging. Runs even when there are no targets (failed = 0).
 * - `filterItems( items )` → optional target filter (e.g. users' self-delete
 *   guard). Defaults to identity.
 * - `isConfirmDisabled( targets )` → optional; disables the destructive button
 *   (e.g. when the self-delete guard leaves zero targets).
 *
 * `Promise.allSettled` is used so one failure in a bulk action doesn't collapse
 * the rest; `onSettled` decides how to report partial success.
 *
 * @param {Object}          config
 * @param {Function}        config.getMessage          `(items, targets) => ReactNode` confirmation copy.
 * @param {string|Function} config.confirmLabel        Destructive button label, or `(targets) => string`.
 * @param {Function}        config.mutate              `(item) => Promise` per-item mutation.
 * @param {Function}        [config.onSettled]         `({ items, targets, results, failed }) => void`.
 * @param {Function}        [config.filterItems]       `(items) => targets` target filter.
 * @param {Function}        [config.isConfirmDisabled] `(targets) => boolean` disables the confirm button.
 * @return {Function} A `RenderModal` component.
 */
export function createBulkConfirmModal( {
	getMessage,
	confirmLabel,
	mutate,
	onSettled,
	filterItems,
	isConfirmDisabled,
} ) {
	return function BulkConfirmModal( {
		items,
		closeModal,
		onActionPerformed,
	} ) {
		// Re-entry guard: the confirm handler is async and `closeModal()` only
		// runs after the await, so without this a fast second click fires a
		// second destructive batch (duplicate DELETEs + spurious failures).
		const [ isBusy, setIsBusy ] = useState( false );
		const targets = filterItems ? filterItems( items ) : items;
		const disabled = isConfirmDisabled
			? isConfirmDisabled( targets )
			: false;
		const label =
			typeof confirmLabel === 'function'
				? confirmLabel( targets )
				: confirmLabel;

		return (
			<Stack
				direction="column"
				gap="md"
				style={ { padding: 'var(--wpds-dimension-padding-lg)' } }
			>
				<Text>{ getMessage( items, targets ) }</Text>
				<Stack direction="row" justify="flex-end" gap="sm">
					<Button
						tone="neutral"
						variant="minimal"
						onClick={ closeModal }
					>
						{ __( 'Cancel', 'wp-admin-workspaces' ) }
					</Button>
					<DestructiveButton
						variant="primary"
						isDestructive
						disabled={ disabled || isBusy }
						isBusy={ isBusy }
						onClick={ async () => {
							if ( isBusy ) {
								return;
							}
							setIsBusy( true );
							// `finally` clears the busy flag even if an
							// app-supplied `onSettled`/`onActionPerformed`
							// callback throws after the batch — otherwise the
							// modal stays open with the confirm button stuck
							// disabled. (`Promise.allSettled` itself never
							// rejects.)
							try {
								let results = [];
								let failed = 0;
								let succeeded = targets;
								if ( targets.length ) {
									results = await Promise.allSettled(
										targets.map( ( item ) =>
											mutate( item )
										)
									);
									failed = results.filter(
										( r ) => r.status === 'rejected'
									).length;
									// Only the items that actually mutated are
									// "performed"; reporting the failures here
									// would deselect rows the user likely wants
									// to retry.
									succeeded = targets.filter(
										( _item, i ) =>
											results[ i ]?.status === 'fulfilled'
									);
								}
								onSettled?.( {
									items,
									targets,
									results,
									failed,
								} );
								onActionPerformed?.( succeeded );
								closeModal();
							} finally {
								setIsBusy( false );
							}
						} }
					>
						{ label }
					</DestructiveButton>
				</Stack>
			</Stack>
		);
	};
}
