import './index.css';
import '../_shared/app.css';
import { useMemo, useState, useCallback } from '@wordpress/element';
import { useEntityRecords, store as coreStore } from '@wordpress/core-data';
import { useDispatch, useSelect } from '@wordpress/data';
import { store as noticesStore } from '@wordpress/notices';
import { Badge, Button, Icon, Stack, Text } from '@wordpress/ui';
import {
	SelectControl,
	CheckboxControl,
	Modal,
	Spinner,
} from '@wordpress/components';
import { __ } from '@wordpress/i18n';
import { decodeEntities } from '@wordpress/html-entities';
import { plus } from '@wordpress/icons';
import { resolveIcon } from '../../runtime/config/iconMap';
import {
	buildItemTree,
	siblingsOf,
	reorderSiblings,
	parentOf,
} from './menuItemTree.mjs';
import { MenuNameModal } from './MenuNameModal';
import { MenuItemModal } from './MenuItemModal';

// The classic-menu screens this app rebuilds use the shared block-theme signal
// stamped at `workspace.theme-support` by `WP_Admin_Workspaces_Appearance_Menu`
// (PHP, priority 4). On a block theme classic menus are superseded by the Site
// Editor's Navigation block, so the native editor disables itself and offers
// the iframe fallback link rather than mounting a half-relevant surface.
function readThemeSupport() {
	return (
		( typeof window !== 'undefined' &&
			window.wpAdminWorkspaces?.config?.[ 'theme-support' ] ) ||
		null
	);
}

// In-workspace route to the full-fidelity classic Menus iframe screen
// (`screens['nav-menus']` → `iframe:nav-menus.php` in the shell). We link to
// the workspace route, NOT the raw `/wp-admin/nav-menus.php`: the latter is
// claimed by the native `menus` screen's `legacy_path`, so the admin-link
// interceptor would bounce it back to `#/menus` (this same disabled panel on a
// block theme). The `#/nav-menus` route mounts the iframe deterministically.
//
// The `nav-menus` screen is ALSO pinned in the shell's Appearance menu group
// (theme-agnostic, surviving the block-theme prune), so it is independently
// reachable as a real nav entry — this panel link is a convenience, not the
// sole entry point.
const NAV_MENUS_FALLBACK = '#/nav-menus';

// Short, translatable labels for the REST `nav_menu_item.type` enum
// (`custom` / `post_type` / `post_type_archive` / `taxonomy`). Keyed by the raw
// REST value so translation tooling sees the `__()` literals at module load;
// the type label is the fallback when the finer-grained `object` value below is
// absent or unknown.
const TYPE_LABELS = {
	custom: __( 'Link', 'wp-admin-workspaces' ),
	post_type: __( 'Page', 'wp-admin-workspaces' ),
	post_type_archive: __( 'Archive', 'wp-admin-workspaces' ),
	taxonomy: __( 'Category', 'wp-admin-workspaces' ),
};

// Finer-grained labels keyed on the REST `nav_menu_item.object` value (the
// specific post type / taxonomy the item targets), so a post reads "Post" not
// "Page" and a tag reads "Tag" not "Category". Falls back to `TYPE_LABELS` for
// any object a plugin registers that we don't know about, then to the raw
// `item.type`. Translation tooling sees the `__()` literals at module load.
const OBJECT_LABELS = {
	post: __( 'Post', 'wp-admin-workspaces' ),
	page: __( 'Page', 'wp-admin-workspaces' ),
	category: __( 'Category', 'wp-admin-workspaces' ),
	post_tag: __( 'Tag', 'wp-admin-workspaces' ),
};

/**
 * Resolve a short, translatable badge label for a menu item, preferring the
 * specific `object` (post/page/category/post_tag) over the coarser `type`.
 *
 * @param {Object} item Raw menu-item record.
 * @return {string} The badge label.
 */
function typeBadgeLabel( item ) {
	if ( item.object && OBJECT_LABELS[ item.object ] ) {
		return OBJECT_LABELS[ item.object ];
	}
	return TYPE_LABELS[ item.type ] ?? item.type;
}

export default function MenusApp() {
	const themeSupport = readThemeSupport();
	const isBlockTheme = !! themeSupport?.[ 'block-theme' ];

	// All menus (containers) — the selector. context:'edit' is the entity
	// default but we pass it explicitly per the shell convention.
	const { records: menus, isResolving: menusLoading } = useEntityRecords(
		'root',
		'menu',
		{ per_page: 100, context: 'edit' }
	);

	// Theme locations (location-name → assigned menu id), keyed by `name`.
	const { records: locations } = useEntityRecords( 'root', 'menuLocation', {
		per_page: 100,
		context: 'edit',
	} );

	const [ selectedMenuId, setSelectedMenuId ] = useState( null );

	// Default the selection to the first menu once they resolve.
	const activeMenuId = useMemo( () => {
		if ( selectedMenuId !== null ) {
			return selectedMenuId;
		}
		return menus && menus.length ? menus[ 0 ].id : null;
	}, [ selectedMenuId, menus ] );

	// Block theme: short-circuit to the disabled fallback panel.
	if ( isBlockTheme ) {
		return (
			<div className="wp-admin-workspaces-app--inset wp-admin-workspaces-app-menus">
				<Stack direction="column" gap="md">
					<Text variant="heading-md" render={ <h2 /> }>
						{ __( 'Menus', 'wp-admin-workspaces' ) }
					</Text>
					<Text>
						{ __(
							'Your active theme is a block theme. Classic menus have been replaced by the Navigation block in the Site Editor.',
							'wp-admin-workspaces'
						) }
					</Text>
					<Stack direction="row" gap="sm">
						<Button
							tone="brand"
							variant="solid"
							render={ <a href="#/site-editor" /> }
						>
							{ __(
								'Open the Site Editor',
								'wp-admin-workspaces'
							) }
						</Button>
						<Button
							tone="neutral"
							variant="outline"
							render={ <a href={ NAV_MENUS_FALLBACK } /> }
						>
							{ __(
								'Open the classic Menus screen',
								'wp-admin-workspaces'
							) }
						</Button>
					</Stack>
				</Stack>
			</div>
		);
	}

	if ( menusLoading && ! menus ) {
		return (
			<div className="wp-admin-workspaces-app--inset wp-admin-workspaces-app-menus">
				<div className="wp-admin-workspaces-app__center">
					<Spinner />
				</div>
			</div>
		);
	}

	return (
		<MenusEditor
			menus={ menus || [] }
			locations={ locations || [] }
			activeMenuId={ activeMenuId }
			onSelectMenu={ setSelectedMenuId }
		/>
	);
}

/**
 * The editor body, mounted once menus have resolved.
 *
 * @param {Object}      root0
 * @param {Array}       root0.menus        Menu container records.
 * @param {Array}       root0.locations    Theme location records (key=name).
 * @param {number|null} root0.activeMenuId Currently selected menu id.
 * @param {Function}    root0.onSelectMenu Set the selected menu id.
 * @return {JSX.Element} The editor.
 */
function MenusEditor( { menus, locations, activeMenuId, onSelectMenu } ) {
	const { saveEntityRecord, deleteEntityRecord, invalidateResolution } =
		useDispatch( coreStore );
	const { createSuccessNotice, createErrorNotice } =
		useDispatch( noticesStore );

	// `saveEntityRecord` / `deleteEntityRecord` resolve (not reject) on a REST
	// failure and stash the error in these selectors — the direct-mutation
	// handlers below consult them to detect server failures. `useSelect`
	// returns the store's bound selectors directly (stable refs).
	const { getLastEntitySaveError, getLastEntityDeleteError } =
		useSelect( coreStore );

	const itemsQuery = useMemo(
		() => ( {
			menus: activeMenuId,
			per_page: 100,
			context: 'edit',
		} ),
		[ activeMenuId ]
	);

	const { records: items, isResolving: itemsLoading } = useEntityRecords(
		'root',
		'menuItem',
		itemsQuery,
		{ enabled: activeMenuId !== null }
	);

	const [ menuModal, setMenuModal ] = useState( null ); // 'create' | record
	const [ itemModal, setItemModal ] = useState( null ); // 'create' | record

	const activeMenu = useMemo(
		() => menus.find( ( m ) => m.id === activeMenuId ) || null,
		[ menus, activeMenuId ]
	);

	const tree = useMemo( () => buildItemTree( items || [] ), [ items ] );

	const refreshItems = useCallback( () => {
		invalidateResolution( 'getEntityRecords', [
			'root',
			'menuItem',
			itemsQuery,
		] );
	}, [ invalidateResolution, itemsQuery ] );

	const refreshMenus = useCallback( () => {
		invalidateResolution( 'getEntityRecords', [
			'root',
			'menu',
			{ per_page: 100, context: 'edit' },
		] );
	}, [ invalidateResolution ] );

	// ── Persist one menu-item field set, then refresh ──────────────────────
	// `saveEntityRecord` does NOT reject on a REST failure — it resolves
	// `undefined` and records the error in `getLastEntitySaveError` (see
	// `_shared/forms/useEntitySave.js:12-21`). Throw on a falsy record so the
	// `try/catch` blocks in moveItem/indentItem/outdentItem surface the error
	// notice, mirroring the `if ( ! record ) throw` guard in MenuItemModal.
	const patchItem = useCallback(
		async ( id, payload ) => {
			const saved = await saveEntityRecord( 'root', 'menuItem', {
				id,
				...payload,
			} );
			if ( ! saved ) {
				const saveError = getLastEntitySaveError(
					'root',
					'menuItem',
					id
				);
				throw new Error(
					saveError?.message ||
						__(
							'The menu item could not be saved.',
							'wp-admin-workspaces'
						)
				);
			}
			return saved;
		},
		[ saveEntityRecord, getLastEntitySaveError ]
	);

	// ── Reorder: move an item up/down among its siblings ───────────────────
	const moveItem = useCallback(
		async ( item, direction ) => {
			const siblings = siblingsOf( items, parentOf( item ) );
			const index = siblings.findIndex( ( s ) => s.id === item.id );
			const swapIndex = direction === 'up' ? index - 1 : index + 1;
			if ( swapIndex < 0 || swapIndex >= siblings.length ) {
				return;
			}
			// Swap the two, then recompute contiguous orders.
			const next = siblings.slice();
			[ next[ index ], next[ swapIndex ] ] = [
				next[ swapIndex ],
				next[ index ],
			];
			const changes = reorderSiblings( next );
			try {
				// Sequential, not Promise.all: core-data's save lock is
				// per-record, but parallel saves against one entity type can
				// surface "saving while another save is in progress" edit
				// collisions on slower backends. The reorder set is small, so
				// the latency cost of awaiting in series is negligible.
				for ( const c of changes ) {
					// eslint-disable-next-line no-await-in-loop -- intentional serialization; see comment.
					await patchItem( c.id, { menu_order: c.menu_order } );
				}
			} catch ( err ) {
				createErrorNotice(
					err?.message ||
						__( 'Failed to reorder item.', 'wp-admin-workspaces' ),
					{ isDismissible: true }
				);
			} finally {
				// Resync regardless of mid-loop failure: earlier PATCHes have
				// already committed server-side, so refresh to whatever state
				// the server actually holds rather than leaving the list in a
				// partially-reordered / duplicate-`menu_order` shape.
				refreshItems();
			}
		},
		[ items, patchItem, refreshItems, createErrorNotice ]
	);

	// ── Indent: nest under the immediately-preceding sibling ───────────────
	const indentItem = useCallback(
		async ( item ) => {
			const siblings = siblingsOf( items, parentOf( item ) );
			const index = siblings.findIndex( ( s ) => s.id === item.id );
			if ( index <= 0 ) {
				return; // First sibling has no preceding item to nest under.
			}
			const newParent = siblings[ index - 1 ];
			const newSiblings = siblingsOf( items, newParent.id );
			const newOrder = newSiblings.length + 1;
			try {
				await patchItem( item.id, {
					parent: newParent.id,
					menu_order: newOrder,
				} );
			} catch ( err ) {
				createErrorNotice(
					err?.message ||
						__( 'Failed to indent item.', 'wp-admin-workspaces' ),
					{ isDismissible: true }
				);
			} finally {
				// Resync on success or failure so the tree reflects the
				// server's actual state after the reparent attempt.
				refreshItems();
			}
		},
		[ items, patchItem, refreshItems, createErrorNotice ]
	);

	// ── Outdent: promote to the grandparent level, after the old parent ────
	const outdentItem = useCallback(
		async ( item ) => {
			const parentId = parentOf( item );
			if ( parentId === 0 ) {
				return; // Already top-level.
			}
			const parentRecord = ( items || [] ).find(
				( it ) => it.id === parentId
			);
			const grandparent = parentRecord ? parentOf( parentRecord ) : 0;
			// Place it right after its old parent among the grandparent's
			// siblings.
			const uncleSiblings = siblingsOf( items, grandparent ).filter(
				( s ) => s.id !== item.id
			);
			const parentIndex = uncleSiblings.findIndex(
				( s ) => s.id === parentId
			);
			const reordered =
				parentIndex >= 0
					? [
							...uncleSiblings.slice( 0, parentIndex + 1 ),
							item,
							...uncleSiblings.slice( parentIndex + 1 ),
					  ]
					: [ ...uncleSiblings, item ];
			const changes = reorderSiblings( reordered );
			try {
				// First reparent the moved item, then settle sibling orders.
				// Sequential (not Promise.all): per-record save lock vs.
				// parallel saves on one entity type — see moveItem's note.
				await patchItem( item.id, { parent: grandparent } );
				for ( const c of changes ) {
					// eslint-disable-next-line no-await-in-loop -- intentional serialization; see comment.
					await patchItem( c.id, { menu_order: c.menu_order } );
				}
			} catch ( err ) {
				createErrorNotice(
					err?.message ||
						__( 'Failed to outdent item.', 'wp-admin-workspaces' ),
					{ isDismissible: true }
				);
			} finally {
				// Resync regardless of mid-sequence failure: the reparent and
				// any earlier sibling PATCHes have already committed
				// server-side, so refresh to the server's actual state rather
				// than leaving a partially-applied move on screen.
				refreshItems();
			}
		},
		[ items, patchItem, refreshItems, createErrorNotice ]
	);

	const removeItem = useCallback(
		async ( item ) => {
			try {
				// Menu items have no trash → force delete. `deleteEntityRecord`
				// defaults to `throwOnError: false` — on a REST failure it
				// resolves and records the error in `getLastEntityDeleteError`,
				// so check that before claiming success.
				await deleteEntityRecord( 'root', 'menuItem', item.id, {
					force: true,
				} );
				const deleteError = getLastEntityDeleteError(
					'root',
					'menuItem',
					item.id
				);
				if ( deleteError ) {
					throw new Error(
						deleteError.message ||
							__(
								'Failed to remove item.',
								'wp-admin-workspaces'
							)
					);
				}
				refreshItems();
				createSuccessNotice(
					__( 'Menu item removed.', 'wp-admin-workspaces' ),
					{ type: 'snackbar' }
				);
			} catch ( err ) {
				createErrorNotice(
					err?.message ||
						__( 'Failed to remove item.', 'wp-admin-workspaces' ),
					{ isDismissible: true }
				);
			}
		},
		[
			deleteEntityRecord,
			getLastEntityDeleteError,
			refreshItems,
			createSuccessNotice,
			createErrorNotice,
		]
	);

	const deleteMenu = useCallback( async () => {
		if ( ! activeMenu ) {
			return;
		}
		try {
			// `deleteEntityRecord` resolves on a REST failure (records the error
			// in `getLastEntityDeleteError`), so check it before claiming the
			// menu was deleted.
			await deleteEntityRecord( 'root', 'menu', activeMenu.id, {
				force: true,
			} );
			const deleteError = getLastEntityDeleteError(
				'root',
				'menu',
				activeMenu.id
			);
			if ( deleteError ) {
				throw new Error(
					deleteError.message ||
						__( 'Failed to delete menu.', 'wp-admin-workspaces' )
				);
			}
			refreshMenus();
			onSelectMenu( null );
			createSuccessNotice( __( 'Menu deleted.', 'wp-admin-workspaces' ), {
				type: 'snackbar',
			} );
		} catch ( err ) {
			createErrorNotice(
				err?.message ||
					__( 'Failed to delete menu.', 'wp-admin-workspaces' ),
				{ isDismissible: true }
			);
		}
	}, [
		activeMenu,
		deleteEntityRecord,
		getLastEntityDeleteError,
		refreshMenus,
		onSelectMenu,
		createSuccessNotice,
		createErrorNotice,
	] );

	// ── Theme-location assignment. menuLocation is keyed by name; assigning a
	// location to a menu writes the menu's `locations` array. We save it on the
	// menu record (the REST `locations` field is the canonical write path). ──
	const assignedLocations = useMemo(
		() => activeMenu?.locations || [],
		[ activeMenu ]
	);

	const toggleLocation = useCallback(
		async ( locationName, checked ) => {
			if ( ! activeMenu ) {
				return;
			}
			const nextLocations = checked
				? [ ...assignedLocations, locationName ]
				: assignedLocations.filter( ( l ) => l !== locationName );
			try {
				// `saveEntityRecord` resolves (not rejects) on a REST failure;
				// the error lives in `getLastEntitySaveError`. Check the returned
				// record and that selector so a failed assignment surfaces an
				// error notice instead of silently reverting the checkbox.
				const saved = await saveEntityRecord( 'root', 'menu', {
					id: activeMenu.id,
					locations: nextLocations,
				} );
				if ( ! saved ) {
					const saveError = getLastEntitySaveError(
						'root',
						'menu',
						activeMenu.id
					);
					throw new Error(
						saveError?.message ||
							__(
								'Failed to update menu locations.',
								'wp-admin-workspaces'
							)
					);
				}
				refreshMenus();
			} catch ( err ) {
				createErrorNotice(
					err?.message ||
						__(
							'Failed to update menu locations.',
							'wp-admin-workspaces'
						),
					{ isDismissible: true }
				);
			}
		},
		[
			activeMenu,
			assignedLocations,
			saveEntityRecord,
			getLastEntitySaveError,
			refreshMenus,
			createErrorNotice,
		]
	);

	const menuOptions = useMemo(
		() =>
			menus.map( ( m ) => ( {
				value: String( m.id ),
				label: decodeEntities( m.name || `#${ m.id }` ),
			} ) ),
		[ menus ]
	);

	return (
		<div className="wp-admin-workspaces-app--inset wp-admin-workspaces-app-menus">
			<Stack direction="column" gap="lg">
				<Stack
					direction="row"
					align="flex-end"
					justify="space-between"
					gap="md"
					wrap="wrap"
				>
					<Stack
						direction="row"
						align="flex-end"
						gap="md"
						wrap="wrap"
					>
						<Text variant="heading-md" render={ <h2 /> }>
							{ __( 'Menus', 'wp-admin-workspaces' ) }
						</Text>
						{ menus.length > 0 && (
							<SelectControl
								label={ __(
									'Select a menu to edit',
									'wp-admin-workspaces'
								) }
								value={
									activeMenuId !== null
										? String( activeMenuId )
										: ''
								}
								options={ menuOptions }
								onChange={ ( value ) =>
									onSelectMenu( Number( value ) )
								}
								__nextHasNoMarginBottom
							/>
						) }
					</Stack>
					<Stack direction="row" gap="sm">
						<Button
							tone="brand"
							variant="solid"
							size="compact"
							onClick={ () => setMenuModal( 'create' ) }
						>
							<Icon icon={ plus } size={ 16 } />
							{ __( 'Create menu', 'wp-admin-workspaces' ) }
						</Button>
						{ activeMenu && (
							<Button
								tone="neutral"
								variant="outline"
								size="compact"
								onClick={ () => setMenuModal( activeMenu ) }
							>
								{ __( 'Rename', 'wp-admin-workspaces' ) }
							</Button>
						) }
					</Stack>
				</Stack>

				{ menus.length === 0 && (
					<Text>
						{ __(
							'No menus yet. Create your first menu to get started.',
							'wp-admin-workspaces'
						) }
					</Text>
				) }

				{ activeMenu && (
					<>
						{ /* Theme-location assignment */ }
						{ locations.length > 0 && (
							<fieldset className="wp-admin-workspaces-app-menus__locations">
								<Text
									variant="heading-sm"
									render={ <legend /> }
								>
									{ __(
										'Theme locations',
										'wp-admin-workspaces'
									) }
								</Text>
								<Stack
									direction="column"
									gap="xs"
									className="wp-admin-workspaces-app-menus__locations-list"
								>
									{ locations.map( ( loc ) => (
										<CheckboxControl
											key={ loc.name }
											label={ decodeEntities(
												loc.description || loc.name
											) }
											checked={ assignedLocations.includes(
												loc.name
											) }
											onChange={ ( checked ) =>
												toggleLocation(
													loc.name,
													checked
												)
											}
											__nextHasNoMarginBottom
										/>
									) ) }
								</Stack>
							</fieldset>
						) }

						{ /* Item list + add control */ }
						<Stack
							direction="row"
							align="center"
							justify="space-between"
						>
							<Text variant="heading-sm" render={ <h3 /> }>
								{ __( 'Menu items', 'wp-admin-workspaces' ) }
							</Text>
							<Button
								tone="neutral"
								variant="outline"
								size="compact"
								onClick={ () => setItemModal( 'create' ) }
							>
								<Icon icon={ plus } size={ 16 } />
								{ __( 'Add item', 'wp-admin-workspaces' ) }
							</Button>
						</Stack>

						<ItemList
							tree={ tree }
							isLoading={ itemsLoading && ! items }
							onMove={ moveItem }
							onIndent={ indentItem }
							onOutdent={ outdentItem }
							onEdit={ setItemModal }
							onRemove={ removeItem }
						/>

						<Stack direction="row" justify="flex-end">
							<DeleteMenuButton onDelete={ deleteMenu } />
						</Stack>
					</>
				) }
			</Stack>

			{ menuModal && (
				<MenuNameModal
					menu={ menuModal === 'create' ? null : menuModal }
					onClose={ () => setMenuModal( null ) }
					onSave={ saveEntityRecord }
					onSaved={ ( record ) => {
						refreshMenus();
						if ( menuModal === 'create' && record?.id ) {
							onSelectMenu( record.id );
						}
						createSuccessNotice(
							__( 'Menu saved.', 'wp-admin-workspaces' ),
							{ type: 'snackbar' }
						);
					} }
					onError={ ( err ) =>
						createErrorNotice(
							err?.message ||
								__(
									'Failed to save menu.',
									'wp-admin-workspaces'
								),
							{ isDismissible: true }
						)
					}
				/>
			) }

			{ itemModal && activeMenu && (
				<MenuItemModal
					item={ itemModal === 'create' ? null : itemModal }
					menuId={ activeMenu.id }
					siblingCount={
						siblingsOf(
							items,
							itemModal === 'create' ? 0 : parentOf( itemModal )
						).length
					}
					onClose={ () => setItemModal( null ) }
					onSave={ saveEntityRecord }
					onSaved={ () => {
						refreshItems();
						createSuccessNotice(
							__( 'Menu item saved.', 'wp-admin-workspaces' ),
							{ type: 'snackbar' }
						);
					} }
					onError={ ( err ) =>
						createErrorNotice(
							err?.message ||
								__(
									'Failed to save menu item.',
									'wp-admin-workspaces'
								),
							{ isDismissible: true }
						)
					}
				/>
			) }
		</div>
	);
}

/**
 * The item-list area: spinner while loading, empty-state copy, or the tree of
 * `MenuItemRow`s. Extracted so the parent avoids a nested ternary.
 *
 * @param {Object}   root0
 * @param {Array}    root0.tree      `[{ item, depth }]` depth-first rows.
 * @param {boolean}  root0.isLoading Items still resolving.
 * @param {Function} root0.onMove    `(item, 'up'|'down') => void`.
 * @param {Function} root0.onIndent  `(item) => void`.
 * @param {Function} root0.onOutdent `(item) => void`.
 * @param {Function} root0.onEdit    `(item) => void` open edit modal.
 * @param {Function} root0.onRemove  `(item) => void` delete item.
 * @return {JSX.Element} The list.
 */
function ItemList( {
	tree,
	isLoading,
	onMove,
	onIndent,
	onOutdent,
	onEdit,
	onRemove,
} ) {
	if ( isLoading ) {
		return (
			<div className="wp-admin-workspaces-app__center">
				<Spinner />
			</div>
		);
	}
	if ( tree.length === 0 ) {
		return (
			<Text>
				{ __( 'This menu has no items yet.', 'wp-admin-workspaces' ) }
			</Text>
		);
	}
	return (
		<ul className="wp-admin-workspaces-app-menus__items">
			{ tree.map( ( { item, depth } ) => (
				<MenuItemRow
					key={ item.id }
					item={ item }
					depth={ depth }
					onMoveUp={ () => onMove( item, 'up' ) }
					onMoveDown={ () => onMove( item, 'down' ) }
					onIndent={ () => onIndent( item ) }
					onOutdent={ () => onOutdent( item ) }
					onEdit={ () => onEdit( item ) }
					onRemove={ () => onRemove( item ) }
				/>
			) ) }
		</ul>
	);
}

/**
 * One row in the item list: label + reorder/indent/edit/remove controls.
 *
 * @param {Object}   root0
 * @param {Object}   root0.item       Raw menu-item record.
 * @param {number}   root0.depth      Nesting depth (0-based), drives indent.
 * @param {Function} root0.onMoveUp   Move up among siblings.
 * @param {Function} root0.onMoveDown Move down among siblings.
 * @param {Function} root0.onIndent   Nest under preceding sibling.
 * @param {Function} root0.onOutdent  Promote to grandparent level.
 * @param {Function} root0.onEdit     Open the edit modal.
 * @param {Function} root0.onRemove   Delete the item.
 * @return {JSX.Element} The row.
 */
function MenuItemRow( {
	item,
	depth,
	onMoveUp,
	onMoveDown,
	onIndent,
	onOutdent,
	onEdit,
	onRemove,
} ) {
	const title = decodeEntities(
		item.title?.rendered || item.title?.raw || item.title || ''
	);
	return (
		<li
			className="wp-admin-workspaces-app-menus__item"
			style={
				depth > 0
					? { marginInlineStart: `${ depth * 1.5 }rem` }
					: undefined
			}
		>
			<Stack
				direction="row"
				align="center"
				justify="space-between"
				gap="sm"
			>
				<Stack direction="row" align="center" gap="xs">
					<Button
						variant="minimal"
						onClick={ onEdit }
						className="wp-admin-workspaces-app-menus__item-label"
					>
						{ title || __( '(no label)', 'wp-admin-workspaces' ) }
					</Button>
					{ item.type && (
						<Badge intent="neutral">
							{ typeBadgeLabel( item ) }
						</Badge>
					) }
				</Stack>
				<Stack direction="row" align="center" gap="xs">
					<IconAction
						icon="chevronUp"
						label={ __( 'Move up', 'wp-admin-workspaces' ) }
						onClick={ onMoveUp }
					/>
					<IconAction
						icon="chevronDown"
						label={ __( 'Move down', 'wp-admin-workspaces' ) }
						onClick={ onMoveDown }
					/>
					{ /* Outdent / Indent: the raw chevron glyphs are LTR-oriented
					     and don't auto-flip under RTL the way the row's
					     `marginInlineStart` indent does. The `aria-label`s stay
					     correct regardless; a future RTL pass can swap the glyphs
					     on `dir="rtl"`. */ }
					<IconAction
						icon="chevronLeft"
						label={ __( 'Outdent', 'wp-admin-workspaces' ) }
						onClick={ onOutdent }
					/>
					<IconAction
						icon="chevronRight"
						label={ __( 'Indent', 'wp-admin-workspaces' ) }
						onClick={ onIndent }
					/>
					<Button variant="minimal" size="small" onClick={ onEdit }>
						{ __( 'Edit', 'wp-admin-workspaces' ) }
					</Button>
					<Button variant="minimal" size="small" onClick={ onRemove }>
						{ __( 'Remove', 'wp-admin-workspaces' ) }
					</Button>
				</Stack>
			</Stack>
		</li>
	);
}

/**
 * A small icon-only button — render an `<Icon>` child plus an `aria-label`
 * (WPDS 0.12 `Button` has no `icon`/`label` props).
 *
 * @param {Object}   root0
 * @param {string}   root0.icon    Icon registry name.
 * @param {string}   root0.label   Accessible label.
 * @param {Function} root0.onClick Click handler.
 * @return {JSX.Element} The icon button.
 */
function IconAction( { icon, label, onClick } ) {
	return (
		<Button
			variant="minimal"
			size="small"
			onClick={ onClick }
			aria-label={ label }
		>
			<Icon icon={ resolveIcon( icon ) } size={ 18 } />
		</Button>
	);
}

/**
 * Delete-menu button with an inline confirm (no extra modal dependency).
 *
 * @param {Object}   root0
 * @param {Function} root0.onDelete Delete the active menu.
 * @return {JSX.Element} The button.
 */
function DeleteMenuButton( { onDelete } ) {
	const [ confirming, setConfirming ] = useState( false );
	if ( ! confirming ) {
		return (
			<Button
				variant="minimal"
				size="compact"
				onClick={ () => setConfirming( true ) }
			>
				{ __( 'Delete menu', 'wp-admin-workspaces' ) }
			</Button>
		);
	}
	return (
		<Modal
			title={ __( 'Delete this menu?', 'wp-admin-workspaces' ) }
			onRequestClose={ () => setConfirming( false ) }
		>
			<Stack direction="column" gap="md">
				<Text>
					{ __(
						'This permanently deletes the menu and all of its items.',
						'wp-admin-workspaces'
					) }
				</Text>
				<Stack direction="row" justify="flex-end" gap="sm">
					<Button
						variant="minimal"
						onClick={ () => setConfirming( false ) }
					>
						{ __( 'Cancel', 'wp-admin-workspaces' ) }
					</Button>
					<Button
						tone="brand"
						variant="solid"
						onClick={ () => {
							setConfirming( false );
							onDelete();
						} }
					>
						{ __( 'Delete', 'wp-admin-workspaces' ) }
					</Button>
				</Stack>
			</Stack>
		</Modal>
	);
}
