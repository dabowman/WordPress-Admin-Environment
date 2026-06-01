import { useMemo, useState } from '@wordpress/element';
import { useEntityRecords } from '@wordpress/core-data';
import { Button, InputControl, Stack, Text } from '@wordpress/ui';
import { SelectControl, Modal } from '@wordpress/components';
import { __ } from '@wordpress/i18n';
import { decodeEntities } from '@wordpress/html-entities';

/**
 * Add or edit a single menu item (`root/menuItem`).
 *
 * Supports the three item kinds wp-admin's "Add menu items" panel offers:
 *
 *   - **Custom link** (`type: 'custom'`) — free `url` + `title`.
 *   - **Page / Post** (`type: 'post_type'`, `object: 'page'|'post'`) — picked
 *     from a relational `SelectControl` of existing posts.
 *   - **Category / Tag** (`type: 'taxonomy'`, `object: 'category'|'post_tag'`)
 *     — picked from a relational `SelectControl` of existing terms.
 *
 * The relational pickers are the lightweight #115 stand-in: a synchronous
 * `useEntityRecords` of the chosen object type, surfaced as `SelectControl`
 * options. (Swap in the shared relational picker primitive when #115 lands.)
 *
 * Per Option B (no drag-and-drop) the modal also exposes a numeric **Order**
 * field so authors can position an item without the reorder buttons.
 *
 * @param {Object}      root0
 * @param {Object|null} root0.item         Item record to edit, or null to add.
 * @param {number}      root0.menuId       Owning menu id (required on create).
 * @param {number}      root0.siblingCount Sibling count, seeds the default order.
 * @param {Function}    root0.onClose      Dismiss the modal.
 * @param {Function}    root0.onSave       `saveEntityRecord` from core-data.
 * @param {Function}    root0.onSaved      `() => void` after a commit.
 * @param {Function}    root0.onError      `(err) => void` on failure.
 * @return {JSX.Element} The modal.
 */
export function MenuItemModal( {
	item,
	menuId,
	siblingCount,
	onClose,
	onSave,
	onSaved,
	onError,
} ) {
	const isNew = ! item;

	// Derive the editor "kind" from the item's REST `type`/`object`.
	const initialKind = useMemo( () => {
		if ( ! item ) {
			return 'custom';
		}
		if ( item.type === 'taxonomy' ) {
			return 'taxonomy';
		}
		if ( item.type === 'post_type' ) {
			return 'post_type';
		}
		return 'custom';
	}, [ item ] );

	const [ kind, setKind ] = useState( initialKind );
	const [ object, setObject ] = useState(
		item?.object || ( initialKind === 'taxonomy' ? 'category' : 'page' )
	);
	const [ objectId, setObjectId ] = useState(
		item?.object_id ? String( item.object_id ) : ''
	);
	const [ title, setTitle ] = useState(
		decodeEntities(
			item?.title?.raw || item?.title?.rendered || item?.title || ''
		)
	);
	const [ url, setUrl ] = useState( item?.url || '' );
	const [ order, setOrder ] = useState(
		String( item?.menu_order || siblingCount + 1 )
	);
	const [ isSaving, setIsSaving ] = useState( false );

	// Relational options for the chosen object type. Only one of these is
	// "live" at a time; the other passes `enabled: false` so we don't fetch
	// both. The post-type picker spans pages/posts; the taxonomy picker spans
	// categories/tags.
	const postType = object === 'post' ? 'post' : 'page';
	const { records: posts } = useEntityRecords(
		'postType',
		postType,
		{ per_page: 100, status: 'publish', context: 'edit' },
		{ enabled: kind === 'post_type' }
	);
	const taxonomy = object === 'post_tag' ? 'post_tag' : 'category';
	const { records: terms } = useEntityRecords(
		'taxonomy',
		taxonomy,
		{ per_page: 100, hide_empty: false, context: 'edit' },
		{ enabled: kind === 'taxonomy' }
	);

	const relationalOptions = useMemo( () => {
		const placeholder = {
			value: '',
			label: __( '— Select —', 'wp-admin-shell' ),
		};
		if ( kind === 'post_type' && posts ) {
			return [
				placeholder,
				...posts.map( ( p ) => ( {
					value: String( p.id ),
					label: decodeEntities(
						p.title?.rendered || p.title?.raw || `#${ p.id }`
					),
				} ) ),
			];
		}
		if ( kind === 'taxonomy' && terms ) {
			return [
				placeholder,
				...terms.map( ( t ) => ( {
					value: String( t.id ),
					label: decodeEntities( t.name || `#${ t.id }` ),
				} ) ),
			];
		}
		return [ placeholder ];
	}, [ kind, posts, terms ] );

	const canSave = kind === 'custom' ? !! url.trim() : !! objectId; // relational kinds need a selected object.

	const handleSave = async () => {
		setIsSaving( true );
		try {
			const payload = {
				title,
				menu_order: Number( order ) || 0,
			};
			if ( isNew ) {
				payload.menus = menuId;
			} else {
				payload.id = item.id;
			}
			if ( kind === 'custom' ) {
				payload.type = 'custom';
				payload.url = url;
				// Clear any prior object linkage when switching to a custom link.
				payload.object = '';
				payload.object_id = 0;
			} else {
				payload.type = kind;
				payload.object = object;
				payload.object_id = Number( objectId ) || 0;
			}
			const record = await onSave( 'root', 'menuItem', payload );
			if ( ! record ) {
				throw new Error(
					__( 'The menu item could not be saved.', 'wp-admin-shell' )
				);
			}
			onSaved?.();
			onClose();
		} catch ( err ) {
			onError?.( err );
		} finally {
			setIsSaving( false );
		}
	};

	return (
		<Modal
			title={
				isNew
					? __( 'Add menu item', 'wp-admin-shell' )
					: __( 'Edit menu item', 'wp-admin-shell' )
			}
			onRequestClose={ onClose }
		>
			<Stack direction="column" gap="md">
				<SelectControl
					label={ __( 'Item type', 'wp-admin-shell' ) }
					value={ kind }
					options={ [
						{
							value: 'custom',
							label: __( 'Custom link', 'wp-admin-shell' ),
						},
						{
							value: 'post_type',
							label: __( 'Page or post', 'wp-admin-shell' ),
						},
						{
							value: 'taxonomy',
							label: __( 'Category or tag', 'wp-admin-shell' ),
						},
					] }
					onChange={ ( value ) => {
						setKind( value );
						setObjectId( '' );
						setObject( value === 'taxonomy' ? 'category' : 'page' );
					} }
					__nextHasNoMarginBottom
				/>

				{ kind === 'post_type' && (
					<SelectControl
						label={ __( 'Object', 'wp-admin-shell' ) }
						value={ object }
						options={ [
							{
								value: 'page',
								label: __( 'Pages', 'wp-admin-shell' ),
							},
							{
								value: 'post',
								label: __( 'Posts', 'wp-admin-shell' ),
							},
						] }
						onChange={ ( value ) => {
							setObject( value );
							setObjectId( '' );
						} }
						__nextHasNoMarginBottom
					/>
				) }

				{ kind === 'taxonomy' && (
					<SelectControl
						label={ __( 'Object', 'wp-admin-shell' ) }
						value={ object }
						options={ [
							{
								value: 'category',
								label: __( 'Categories', 'wp-admin-shell' ),
							},
							{
								value: 'post_tag',
								label: __( 'Tags', 'wp-admin-shell' ),
							},
						] }
						onChange={ ( value ) => {
							setObject( value );
							setObjectId( '' );
						} }
						__nextHasNoMarginBottom
					/>
				) }

				{ kind !== 'custom' && (
					<SelectControl
						label={ __( 'Select', 'wp-admin-shell' ) }
						value={ objectId }
						options={ relationalOptions }
						onChange={ ( value ) => setObjectId( value ) }
						__nextHasNoMarginBottom
					/>
				) }

				{ kind === 'custom' && (
					<InputControl
						label={ __( 'URL', 'wp-admin-shell' ) }
						value={ url }
						onChange={ ( e ) =>
							setUrl(
								typeof e === 'string'
									? e
									: e?.target?.value || ''
							)
						}
					/>
				) }

				<InputControl
					label={ __( 'Navigation label', 'wp-admin-shell' ) }
					value={ title }
					onChange={ ( e ) =>
						setTitle(
							typeof e === 'string' ? e : e?.target?.value || ''
						)
					}
				/>

				<InputControl
					type="number"
					label={ __( 'Order', 'wp-admin-shell' ) }
					value={ order }
					onChange={ ( e ) =>
						setOrder(
							typeof e === 'string' ? e : e?.target?.value || ''
						)
					}
				/>

				{ kind !== 'custom' && ! objectId && (
					<Text className="wp-admin-shell-app__muted">
						{ __(
							'Pick an object to link this item to.',
							'wp-admin-shell'
						) }
					</Text>
				) }

				<Stack direction="row" justify="flex-end" gap="sm">
					<Button variant="minimal" onClick={ onClose }>
						{ __( 'Cancel', 'wp-admin-shell' ) }
					</Button>
					<Button
						tone="brand"
						variant="solid"
						onClick={ handleSave }
						loading={ isSaving }
						disabled={ ! canSave || isSaving }
					>
						{ isNew
							? __( 'Add item', 'wp-admin-shell' )
							: __( 'Save', 'wp-admin-shell' ) }
					</Button>
				</Stack>
			</Stack>
		</Modal>
	);
}
