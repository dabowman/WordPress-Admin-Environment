import { SelectControl, Spinner } from '@wordpress/components';
import { useMemo } from '@wordpress/element';
import { useEntityRecords } from '@wordpress/core-data';
import { __, sprintf } from '@wordpress/i18n';
import { decodeEntities } from '@wordpress/html-entities';

/**
 * Reassign-target picker for the bulk/per-row user-delete confirm modal.
 *
 * WordPress has no user trash, so deleting a user must hand their authored
 * content to another account or it is orphaned. The historic default reassigned
 * everything to the acting user; this lets an admin choose a different target —
 * mirroring classic wp-admin's "Attribute all content to:" dropdown.
 *
 * Candidates are fetched fresh (the list `useEntityRecords` is paginated, so it
 * can't be reused) and the users being deleted are excluded — reassigning a
 * deleted user's content to another deleted user would re-orphan it. The acting
 * user is always present as an option (the modal seeds the select to them, and
 * the bulk action's self-delete guard keeps them out of the target set), with a
 * `window`-global display-name fallback for the rare case where they fall
 * outside the first page of candidates.
 *
 * @param {Object}   root0          Props.
 * @param {Array}    root0.targets  Users about to be deleted (excluded as targets).
 * @param {number}   root0.value    Currently-selected reassign target id.
 * @param {Function} root0.setValue `(id:number) => void` — updates the modal's control state.
 * @return {JSX.Element} The reassign-target select (or a spinner while loading).
 */
export default function ReassignSelect( { targets, value, setValue } ) {
	const currentUserId = window.wpAdminWorkspaces?.userId;

	const { records, isResolving } = useEntityRecords( 'root', 'user', {
		per_page: 100,
		orderby: 'name',
		order: 'asc',
		context: 'view',
		_fields: 'id,name',
	} );

	const targetIds = useMemo(
		() => new Set( targets.map( ( item ) => item.id ) ),
		[ targets ]
	);

	const options = useMemo( () => {
		const list = ( records ?? [] )
			.filter( ( record ) => ! targetIds.has( record.id ) )
			.map( ( record ) => ( {
				value: record.id,
				label: decodeEntities( record.name || '' ),
			} ) );

		// Guarantee the acting user is selectable even if they fall outside the
		// first page of candidates (the modal defaults the target to them).
		if (
			currentUserId &&
			! targetIds.has( currentUserId ) &&
			! list.some( ( option ) => option.value === currentUserId )
		) {
			list.unshift( {
				value: currentUserId,
				label: sprintf(
					/* translators: %s: the acting user's display name. */
					__( '%s (you)', 'wp-admin-workspaces' ),
					decodeEntities(
						window.wpAdminWorkspaces?.user?.displayName ||
							__( 'You', 'wp-admin-workspaces' )
					)
				),
			} );
		}

		return list;
	}, [ records, targetIds, currentUserId ] );

	if ( isResolving && ! records ) {
		return <Spinner />;
	}

	return (
		<SelectControl
			label={ __( 'Reassign content to', 'wp-admin-workspaces' ) }
			value={ value != null ? String( value ) : '' }
			options={ options.map( ( option ) => ( {
				value: String( option.value ),
				label: option.label,
			} ) ) }
			onChange={ ( next ) => setValue( Number( next ) ) }
			__nextHasNoMarginBottom
		/>
	);
}
