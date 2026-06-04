import './index.css';
import { IconButton, Stack } from '@wordpress/ui';
import { DropdownMenu, MenuGroup, MenuItem } from '@wordpress/components';
import { useSelect } from '@wordpress/data';
import { store as coreStore } from '@wordpress/core-data';
import { _x } from '@wordpress/i18n';
import { plus } from '@wordpress/icons';
import { decodeEntities } from '@wordpress/html-entities';

import { resolveIcon } from '../../runtime/config/iconMap';
import ArbitraryIcon, {
	TrustedNodeTitle,
} from '../_shared/icons/ArbitraryIcon';

/**
 * core:toolbar-actions — renders left + right action clusters in a
 * toolbar region. Sources:
 *
 *   1. `config.left` / `config.right` — authored action descriptors:
 *        - { href, icon, label, external? } — link
 *        - { command, icon, label }         — built-in command via
 *          `COMMAND_HREFS`
 *      An action may also carry an `iconSource` escape-hatch descriptor
 *      (arbitrary-icon, #127/#128) rendered through `ArbitraryIcon`.
 *   2. **Dynamic +New (#129)** — a dropdown enumerated from the
 *      registered post types (`GET /wp/v2/types?context=edit` via
 *      core-data), gated on each type's create capability, building
 *      `#/{rest_base}/new` hrefs. Mirrors wp-admin's runtime `+New`.
 *   3. **Admin-bar harvest (#128)** — plugin admin-bar nodes harvested
 *      server-side (`window.wpAdminWorkspaces.adminBar`) that the shell
 *      doesn't own first-class. Each top-level node renders as a button
 *      (or a dropdown when it has children). Node titles are arbitrary
 *      admin HTML → rendered through the engine-side arbitrary-icon
 *      escape hatch (`TrustedNodeTitle`), NOT the kernel icon registry.
 *
 * Name-icon actions render through `@wordpress/ui` `IconButton` (its
 * `icon` prop doubles as the assistive-tech label + tooltip via `label`;
 * `render={<a/>}` swaps the element for an anchor so middle-click /
 * Cmd-click / right-click → "Copy link" work natively). Actions that
 * render ARBITRARY content — a harvested node-title HTML blob or an
 * `iconSource` <img> — use a plain styled anchor instead, since
 * `IconButton` is icon-prop-based and not a reliable host for arbitrary
 * children (it would risk rendering blank).
 */

const COMMAND_HREFS = {
	'core/new-post': '#/posts/new',
	'core/new-page': '#/pages/new',
};

/**
 * Internal `show_in_rest` post types that are creatable for an admin but
 * deliberately EXCLUDED from wp-admin's `+New` menu. Classic gates each
 * type on `$ptype_obj->show_in_admin_bar` (not exposed in the REST `types`
 * response), so `rest_base` + the create cap alone over-enumerate — these
 * editor-infrastructure types would surface as "Patterns", "Navigation
 * Menu", "Templates", etc. Mirror classic with an explicit denylist by
 * slug (matched against `type.slug`).
 *
 * @type {Set<string>}
 */
const NEW_CONTENT_TYPE_DENYLIST = new Set( [
	'attachment', // Media has no editor-create flow.
	'wp_block', // Reusable blocks / patterns.
	'wp_navigation', // Navigation menus.
	'wp_template', // Block templates.
	'wp_template_part', // Block template parts.
	'wp_font_family', // Font Library.
	'wp_font_face', // Font Library.
	'wp_global_styles', // Global styles record.
] );

export default function ToolbarActionsApp( { config = {} } ) {
	const left = Array.isArray( config.left ) ? config.left : [];
	const right = Array.isArray( config.right ) ? config.right : [];

	const newItems = useNewContentItems();
	const adminBarNodes = useAdminBarNodes();

	const hasContent =
		left.length || right.length || newItems.length || adminBarNodes.length;
	if ( ! hasContent ) {
		return null;
	}

	return (
		<Stack direction="row" gap="md" align="center" style={ { flex: 1 } }>
			<Stack direction="row" gap="xs" align="center">
				{ newItems.length > 0 && <NewContentMenu items={ newItems } /> }
				{ left.map( ( action, i ) =>
					renderAction( action, `left-${ i }` )
				) }
			</Stack>

			<div style={ { flex: 1 } } />

			<Stack direction="row" gap="xs" align="center">
				{ right.map( ( action, i ) =>
					renderAction( action, `right-${ i }` )
				) }
				{ adminBarNodes.map( ( node ) => (
					<AdminBarNode key={ `ab-${ node.id }` } node={ node } />
				) ) }
			</Stack>
		</Stack>
	);
}

/**
 * Enumerate the post types the current user may create, building `+New`
 * dropdown items. Reads `getPostTypes({ context: 'edit' })` from
 * core-data and gates each on `canUser('create', { kind, name })`.
 *
 * @return {Array<{ id: string, label: string, href: string }>} New-content items.
 */
function useNewContentItems() {
	return useSelect( ( select ) => {
		const core = select( coreStore );
		const postTypes = core.getPostTypes( { context: 'edit' } );
		if ( ! postTypes ) {
			return [];
		}
		const items = [];
		for ( const type of postTypes ) {
			// Skip non-creatable / internal types. wp-admin's +New shows
			// content types gated on `show_in_admin_bar` (not exposed in the
			// REST `types` response). `rest_base` presence + the create cap
			// alone over-enumerate — the editor-infrastructure types
			// (wp_block / wp_navigation / wp_template* / fonts) are
			// creatable for an admin but excluded from classic's +New. The
			// denylist mirrors that exclusion.
			const restBase = type?.rest_base;
			if ( ! restBase || NEW_CONTENT_TYPE_DENYLIST.has( type?.slug ) ) {
				continue;
			}
			const canCreate = core.canUser( 'create', {
				kind: 'postType',
				name: type.slug,
			} );
			if ( ! canCreate ) {
				continue;
			}
			items.push( {
				id: type.slug,
				label: decodeEntities(
					type?.labels?.add_new_item ||
						type?.labels?.singular_name ||
						type?.name ||
						type.slug
				),
				href: `#/${ restBase }/new`,
			} );
		}
		return items;
	}, [] );
}

/**
 * Read the server-harvested admin-bar plugin nodes (#128). Defensive:
 * returns an empty array when the global is absent or malformed.
 *
 * @return {Array<Object>} Harvested admin-bar node records.
 */
function useAdminBarNodes() {
	const nodes = window.wpAdminWorkspaces?.adminBar;
	return Array.isArray( nodes ) ? nodes : [];
}

/**
 * The dynamic `+New` dropdown. A single trigger button opens a menu of
 * creatable post types.
 *
 * @param {Object} root0
 * @param {Array}  root0.items New-content items.
 * @return {*} React element.
 */
function NewContentMenu( { items } ) {
	const label = _x( 'New', 'admin bar add-new menu', 'wp-admin-workspaces' );
	return (
		<DropdownMenu
			icon={ plus }
			label={ label }
			toggleProps={ { 'aria-label': label } }
		>
			{ () => (
				<MenuGroup>
					{ items.map( ( item ) => (
						<MenuItem key={ item.id } href={ item.href }>
							{ item.label }
						</MenuItem>
					) ) }
				</MenuGroup>
			) }
		</DropdownMenu>
	);
}

/**
 * Render one harvested admin-bar node. Leaf nodes (no children) render
 * as an anchor IconButton; nodes with children render as a dropdown.
 * Node titles are arbitrary admin HTML (`TrustedNodeTitle`).
 *
 * @param {Object} root0
 * @param {Object} root0.node Harvested admin-bar node record.
 * @return {*} React element.
 */
function AdminBarNode( { node } ) {
	const children = Array.isArray( node.children ) ? node.children : [];
	const tooltip = node?.meta?.tooltip || stripTags( node.title );
	const target = node?.meta?.target;

	if ( children.length === 0 ) {
		if ( ! node.href ) {
			return null;
		}
		const external = target === '_blank';
		// The node title is arbitrary admin HTML (`TrustedNodeTitle`).
		// `@wordpress/ui` `IconButton` is icon-prop-based and isn't a
		// reliable host for arbitrary children, so render a plain styled
		// anchor — guarantees the harvested title paints (never blank).
		return (
			<a
				className="wp-admin-workspaces-toolbar-action"
				href={ node.href }
				target={ target || undefined }
				rel={ external ? 'noopener noreferrer' : undefined }
				aria-label={ tooltip }
				title={ tooltip }
			>
				<TrustedNodeTitle html={ node.title } />
			</a>
		);
	}

	return (
		<DropdownMenu
			label={ tooltip }
			toggleProps={ { 'aria-label': tooltip } }
			// DropdownMenu's `icon` is name-based and the harvested title is
			// arbitrary admin HTML, so render the plain-text title in the
			// toggle (accessible label) rather than the raw markup.
			text={ stripTags( node.title ) }
		>
			{ () => (
				<MenuGroup>
					{ node.href && (
						<MenuItem href={ node.href }>
							{ stripTags( node.title ) }
						</MenuItem>
					) }
					{ children.map( ( child ) =>
						child.href ? (
							<MenuItem key={ child.id } href={ child.href }>
								{ stripTags( child.title ) }
							</MenuItem>
						) : (
							<MenuItem key={ child.id } disabled>
								{ stripTags( child.title ) }
							</MenuItem>
						)
					) }
				</MenuGroup>
			) }
		</DropdownMenu>
	);
}

function renderAction( action, key ) {
	const href = action.href || COMMAND_HREFS[ action.command ];
	if ( ! href ) {
		return null;
	}
	const isExternal = !! action.external;

	// Arbitrary-icon escape hatch (#127/#128): an `iconSource` descriptor
	// renders an <img>/dashicon through `ArbitraryIcon`. `@wordpress/ui`
	// `IconButton` is icon-prop-based and isn't a reliable host for
	// arbitrary children — use a plain styled anchor so the harvested icon
	// always paints. The name-icon path below keeps `IconButton` (its
	// `icon` prop is the supported route).
	if ( action.iconSource ) {
		return (
			<a
				key={ key }
				className="wp-admin-workspaces-toolbar-action"
				href={ href }
				target={ isExternal ? '_blank' : undefined }
				rel={ isExternal ? 'noopener noreferrer' : undefined }
				aria-label={ action.label }
				title={ action.label }
			>
				<ArbitraryIcon iconSource={ action.iconSource } size={ 24 } />
			</a>
		);
	}

	return (
		<IconButton
			key={ key }
			tone="neutral"
			variant="minimal"
			size="compact"
			icon={ resolveIcon( action.icon ) }
			label={ action.label }
			render={
				<a
					href={ href }
					target={ isExternal ? '_blank' : undefined }
					rel={ isExternal ? 'noopener noreferrer' : undefined }
				/>
			}
		/>
	);
}

/**
 * Strip HTML tags for a plain-text aria-label / tooltip / menu label
 * when a node has no explicit `meta.tooltip`.
 *
 * @param {string} html Title HTML.
 * @return {string} Plain text.
 */
function stripTags( html ) {
	if ( typeof html !== 'string' ) {
		return '';
	}
	return decodeEntities( html.replace( /<[^>]*>/g, '' ) ).trim();
}
