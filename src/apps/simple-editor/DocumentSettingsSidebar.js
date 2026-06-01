/* eslint-disable @wordpress/no-unsafe-wp-apis -- SelectControl/FormToggle/Modal have no @wordpress/ui 0.12 port. */
import { useMemo, useCallback } from '@wordpress/element';
import { useEntityRecords } from '@wordpress/core-data';
import {
	Fill,
	SelectControl,
	FormToggle,
	FormTokenField,
	TextareaControl,
	BaseControl,
	CheckboxControl,
} from '@wordpress/components';
import { Stack, Text, Collapsible, Button, Badge } from '@wordpress/ui';
import { MediaUpload, MediaUploadCheck } from '@wordpress/block-editor';
import { __ } from '@wordpress/i18n';
import { decodeEntities } from '@wordpress/html-entities';
import './document-settings.css';

const VISIBILITY_OPTIONS = [
	{ value: 'public', label: __( 'Public', 'wp-admin-shell' ) },
	{ value: 'private', label: __( 'Private', 'wp-admin-shell' ) },
	{
		value: 'password',
		label: __( 'Password protected', 'wp-admin-shell' ),
	},
];

/**
 * Map an entity record's `{ status, password }` to a single visibility token.
 *
 * @param {string} status   Post status.
 * @param {string} password Post password.
 * @return {'public'|'private'|'password'} Visibility token.
 */
function deriveVisibility( status, password ) {
	if ( status === 'private' ) {
		return 'private';
	}
	if ( password ) {
		return 'password';
	}
	return 'public';
}

/**
 * A collapsible inspector panel. Mirrors the WordPress document-sidebar panel
 * shape (title row + collapsible body) using `@wordpress/ui` `Collapsible`.
 *
 * @param {Object}  root0
 * @param {string}  root0.title         Panel heading.
 * @param {boolean} [root0.initialOpen] Whether the panel starts expanded.
 * @param {Node}    [root0.summary]     Optional inline summary (e.g. a Badge) shown in the trigger.
 * @param {Node}    root0.children      Panel body.
 * @return {JSX.Element} The panel.
 */
function Panel( { title, initialOpen = true, summary, children } ) {
	return (
		<Collapsible.Root
			defaultOpen={ initialOpen }
			className="wp-admin-shell-doc-settings__panel"
		>
			<Collapsible.Trigger className="wp-admin-shell-doc-settings__panel-trigger">
				<Text variant="heading-sm" render={ <span /> }>
					{ title }
				</Text>
				{ summary }
			</Collapsible.Trigger>
			<Collapsible.Panel className="wp-admin-shell-doc-settings__panel-body">
				<Stack direction="column" gap="md">
					{ children }
				</Stack>
			</Collapsible.Panel>
		</Collapsible.Root>
	);
}

/**
 * Status / Visibility + Publish / Schedule.
 *
 * The simple version of core's publish matrix: a visibility select
 * (public / private / password) plus an optional password input, and a
 * publish-vs-schedule date control. Status itself is driven by the toolbar
 * Publish button — this panel only governs *visibility* and *scheduling*.
 *
 * @param {Object}   root0
 * @param {Object}   root0.editedRecord Buffered entity record.
 * @param {Function} root0.edit         Entity `edit()`.
 * @return {JSX.Element} The panel.
 */
function PublishPanel( { editedRecord, edit } ) {
	const status = editedRecord?.status ?? 'draft';
	const password = editedRecord?.password ?? '';
	const visibility = deriveVisibility( status, password );
	const isPublished = status === 'publish' || status === 'private';

	// `date` arrives as an ISO-ish string; the <input type="datetime-local">
	// wants `YYYY-MM-DDTHH:mm`. Trim to minute precision.
	const dateValue = ( editedRecord?.date || '' ).slice( 0, 16 );

	const onVisibilityChange = useCallback(
		( next ) => {
			if ( next === 'private' ) {
				edit( { status: 'private', password: '' } );
			} else if ( next === 'password' ) {
				// Demote a `private` post back to a public-ish status so the
				// password actually gates it; keep `publish` when already live.
				edit( {
					status: status === 'private' ? 'publish' : status,
				} );
			} else {
				edit( {
					status: status === 'private' ? 'publish' : status,
					password: '',
				} );
			}
		},
		[ edit, status ]
	);

	return (
		<Panel
			title={ __( 'Status & visibility', 'wp-admin-shell' ) }
			summary={
				<Badge
					intent={ isPublished ? 'success' : 'neutral' }
					className="wp-admin-shell-doc-settings__summary"
				>
					{ status }
				</Badge>
			}
		>
			<SelectControl
				label={ __( 'Visibility', 'wp-admin-shell' ) }
				value={ visibility }
				options={ VISIBILITY_OPTIONS }
				onChange={ onVisibilityChange }
				__nextHasNoMarginBottom
			/>
			{ visibility === 'password' && (
				<BaseControl
					__nextHasNoMarginBottom
					id="wp-admin-shell-doc-settings-password"
					label={ __( 'Password', 'wp-admin-shell' ) }
				>
					<input
						id="wp-admin-shell-doc-settings-password"
						type="text"
						className="components-text-control__input"
						value={ password }
						onChange={ ( e ) =>
							edit( { password: e.target.value } )
						}
					/>
				</BaseControl>
			) }
			<BaseControl
				__nextHasNoMarginBottom
				id="wp-admin-shell-doc-settings-date"
				label={ __( 'Publish on', 'wp-admin-shell' ) }
				help={ __(
					'Set a future date to schedule. Use the Publish button to go live.',
					'wp-admin-shell'
				) }
			>
				<input
					id="wp-admin-shell-doc-settings-date"
					type="datetime-local"
					className="components-text-control__input"
					value={ dateValue }
					onChange={ ( e ) =>
						edit( {
							date: e.target.value
								? new Date( e.target.value ).toISOString()
								: null,
						} )
					}
				/>
			</BaseControl>
		</Panel>
	);
}

/**
 * Slug / URL panel.
 *
 * @param {Object}   root0
 * @param {Object}   root0.editedRecord Buffered entity record.
 * @param {Function} root0.edit         Entity `edit()`.
 * @return {JSX.Element} The panel.
 */
function SlugPanel( { editedRecord, edit } ) {
	return (
		<Panel title={ __( 'URL', 'wp-admin-shell' ) } initialOpen={ false }>
			<BaseControl
				__nextHasNoMarginBottom
				id="wp-admin-shell-doc-settings-slug"
				label={ __( 'Slug', 'wp-admin-shell' ) }
			>
				<input
					id="wp-admin-shell-doc-settings-slug"
					type="text"
					className="components-text-control__input"
					value={ editedRecord?.slug ?? '' }
					onChange={ ( e ) => edit( { slug: e.target.value } ) }
				/>
			</BaseControl>
		</Panel>
	);
}

/**
 * Build a token field bound to a flat (non-hierarchical) taxonomy. Tokens are
 * term *names*; on change we resolve names → ids, creating missing terms is
 * left to core's REST `tags` behaviour (we only assign known ids here to keep
 * the panel simple — unknown tokens are dropped).
 *
 * @param {Object}   root0
 * @param {string}   root0.label    Field label.
 * @param {string}   root0.restBase Taxonomy REST base (e.g. `tags`).
 * @param {number[]} root0.value    Selected term ids.
 * @param {Function} root0.onChange Receives the next id array.
 * @return {JSX.Element} The token field.
 */
function TaxonomyTokenField( { label, restBase, value, onChange } ) {
	const { records } = useEntityRecords( 'taxonomy', restBase, {
		per_page: 100,
		_fields: 'id,name',
		context: 'view',
	} );

	const byName = useMemo( () => {
		const map = new Map();
		( records || [] ).forEach( ( t ) =>
			map.set( decodeEntities( t.name ), t.id )
		);
		return map;
	}, [ records ] );

	const byId = useMemo( () => {
		const map = new Map();
		( records || [] ).forEach( ( t ) =>
			map.set( t.id, decodeEntities( t.name ) )
		);
		return map;
	}, [ records ] );

	const suggestions = useMemo( () => [ ...byName.keys() ], [ byName ] );
	const tokens = useMemo(
		() => ( value || [] ).map( ( id ) => byId.get( id ) ).filter( Boolean ),
		[ value, byId ]
	);

	const handleChange = useCallback(
		( names ) => {
			const ids = names
				.map( ( name ) => byName.get( name ) )
				.filter( ( id ) => id !== undefined );
			onChange( ids );
		},
		[ byName, onChange ]
	);

	return (
		<FormTokenField
			label={ label }
			value={ tokens }
			suggestions={ suggestions }
			onChange={ handleChange }
			__nextHasNoMarginBottom
			__next40pxDefaultSize
		/>
	);
}

/**
 * A hierarchical (categories) multi-select rendered as checkboxes.
 *
 * @param {Object}   root0
 * @param {string}   root0.restBase Taxonomy REST base (e.g. `categories`).
 * @param {number[]} root0.value    Selected term ids.
 * @param {Function} root0.onChange Receives the next id array.
 * @return {JSX.Element} The checklist.
 */
function CategoryChecklist( { restBase, value, onChange } ) {
	const { records } = useEntityRecords( 'taxonomy', restBase, {
		per_page: 100,
		orderby: 'name',
		order: 'asc',
		_fields: 'id,name',
		context: 'view',
	} );
	const selected = useMemo( () => value || [], [ value ] );

	const toggle = useCallback(
		( id, checked ) => {
			onChange(
				checked
					? [ ...selected, id ]
					: selected.filter( ( x ) => x !== id )
			);
		},
		[ selected, onChange ]
	);

	if ( ! records ) {
		return null;
	}

	return (
		<div
			className="wp-admin-shell-doc-settings__checklist"
			role="group"
			aria-label={ __( 'Categories', 'wp-admin-shell' ) }
		>
			{ records.map( ( term ) => (
				<CheckboxControl
					key={ term.id }
					__nextHasNoMarginBottom
					label={ decodeEntities( term.name ) }
					checked={ selected.includes( term.id ) }
					onChange={ ( checked ) => toggle( term.id, checked ) }
				/>
			) ) }
		</div>
	);
}

/**
 * Featured Image panel — opens the core media modal and binds the selection to
 * `featured_media`.
 *
 * @param {Object}   root0
 * @param {Object}   root0.editedRecord Buffered entity record.
 * @param {Function} root0.edit         Entity `edit()`.
 * @return {JSX.Element} The panel.
 */
function FeaturedImagePanel( { editedRecord, edit } ) {
	const id = editedRecord?.featured_media || 0;
	const { records } = useEntityRecords(
		'postType',
		'attachment',
		{ include: [ id ], _fields: 'id,source_url,alt_text', context: 'view' },
		{ enabled: !! id }
	);
	const media = id && records ? records[ 0 ] : null;

	return (
		<Panel
			title={ __( 'Featured image', 'wp-admin-shell' ) }
			initialOpen={ false }
		>
			<MediaUploadCheck>
				<MediaUpload
					title={ __( 'Featured image', 'wp-admin-shell' ) }
					allowedTypes={ [ 'image' ] }
					value={ id }
					onSelect={ ( m ) => edit( { featured_media: m.id } ) }
					render={ ( { open } ) => (
						<Stack direction="column" gap="sm">
							{ media?.source_url && (
								<img
									src={ media.source_url }
									alt={ media.alt_text || '' }
									className="wp-admin-shell-doc-settings__thumb"
								/>
							) }
							<Stack direction="row" gap="sm">
								<Button
									variant="outline"
									tone="neutral"
									size="compact"
									onClick={ open }
								>
									{ id
										? __(
												'Replace image',
												'wp-admin-shell'
										  )
										: __(
												'Set featured image',
												'wp-admin-shell'
										  ) }
								</Button>
								{ !! id && (
									<Button
										variant="minimal"
										size="compact"
										onClick={ () =>
											edit( { featured_media: 0 } )
										}
									>
										{ __( 'Remove', 'wp-admin-shell' ) }
									</Button>
								) }
							</Stack>
						</Stack>
					) }
				/>
			</MediaUploadCheck>
		</Panel>
	);
}

/**
 * Author panel — capability-gated on `edit_others_posts`.
 *
 * @param {Object}   root0
 * @param {Object}   root0.editedRecord Buffered entity record.
 * @param {Function} root0.edit         Entity `edit()`.
 * @return {JSX.Element|null} The panel, or null when the current user can't reassign.
 */
function AuthorPanel( { editedRecord, edit } ) {
	const { records } = useEntityRecords( 'root', 'user', {
		who: 'authors',
		per_page: 100,
		_fields: 'id,name',
		context: 'view',
	} );

	if ( ! records ) {
		return null;
	}

	const options = records.map( ( u ) => ( {
		value: String( u.id ),
		label: decodeEntities( u.name ),
	} ) );

	return (
		<Panel title={ __( 'Author', 'wp-admin-shell' ) } initialOpen={ false }>
			<SelectControl
				label={ __( 'Author', 'wp-admin-shell' ) }
				value={ String( editedRecord?.author ?? '' ) }
				options={ options }
				onChange={ ( v ) => edit( { author: Number( v ) } ) }
				__nextHasNoMarginBottom
			/>
		</Panel>
	);
}

/**
 * Excerpt panel.
 *
 * @param {Object}   root0
 * @param {Object}   root0.editedRecord Buffered entity record.
 * @param {Function} root0.edit         Entity `edit()`.
 * @return {JSX.Element} The panel.
 */
function ExcerptPanel( { editedRecord, edit } ) {
	const excerpt =
		typeof editedRecord?.excerpt === 'string'
			? editedRecord.excerpt
			: editedRecord?.excerpt?.raw ?? '';
	return (
		<Panel
			title={ __( 'Excerpt', 'wp-admin-shell' ) }
			initialOpen={ false }
		>
			<TextareaControl
				label={ __( 'Write an excerpt (optional)', 'wp-admin-shell' ) }
				value={ excerpt }
				rows={ 4 }
				onChange={ ( v ) => edit( { excerpt: v } ) }
				__nextHasNoMarginBottom
			/>
		</Panel>
	);
}

/**
 * Discussion panel — comments / pingbacks open|closed. Gated on the post type
 * supporting comments.
 *
 * @param {Object}   root0
 * @param {Object}   root0.editedRecord     Buffered entity record.
 * @param {Function} root0.edit             Entity `edit()`.
 * @param {boolean}  root0.supportsComments Whether the post type supports comments.
 * @return {JSX.Element|null} The panel, or null when comments are unsupported.
 */
function DiscussionPanel( { editedRecord, edit, supportsComments } ) {
	if ( ! supportsComments ) {
		return null;
	}
	const commentsOpen = editedRecord?.comment_status === 'open';
	const pingsOpen = editedRecord?.ping_status === 'open';
	return (
		<Panel
			title={ __( 'Discussion', 'wp-admin-shell' ) }
			initialOpen={ false }
		>
			<Stack direction="row" justify="space-between" align="center">
				<Text render={ <span /> }>
					{ __( 'Allow comments', 'wp-admin-shell' ) }
				</Text>
				<FormToggle
					checked={ commentsOpen }
					onChange={ () =>
						edit( {
							comment_status: commentsOpen ? 'closed' : 'open',
						} )
					}
				/>
			</Stack>
			<Stack direction="row" justify="space-between" align="center">
				<Text render={ <span /> }>
					{ __( 'Allow pingbacks & trackbacks', 'wp-admin-shell' ) }
				</Text>
				<FormToggle
					checked={ pingsOpen }
					onChange={ () =>
						edit( {
							ping_status: pingsOpen ? 'closed' : 'open',
						} )
					}
				/>
			</Stack>
		</Panel>
	);
}

/**
 * The native document-settings sidebar for `core:simple-editor`.
 *
 * Renders as a `<Fill name="core:editor.sidebar">` so it composes with the
 * editor's `<Slot>` of the same name — plugins can fill the SAME slot with
 * their own panels, which render below this one. Each panel mutates the same
 * `postType:{type}:{id}` entity via buffered `edit()`; the editor's shared
 * `useEntityAutosave` debounce commits the changes. No new endpoint.
 *
 * Deliberately scoped to blogging/publish metadata — NO Block tab, NO Page
 * Attributes / templates / custom meta (issue #119 scope fences).
 *
 * @param {Object}   root0
 * @param {Object}   root0.editedRecord      Buffered entity record (from the editor's `useEntityRecord`).
 * @param {Function} root0.edit              Entity `edit()`.
 * @param {Object}   [root0.postTypeObject]  Resolved post-type entity (supports, capabilities, taxonomies).
 * @param {boolean}  [root0.canAssignAuthor] Whether the user may reassign the author (`edit_others_posts`).
 * @return {JSX.Element} The sidebar fill.
 */
export default function DocumentSettingsSidebar( {
	editedRecord,
	edit,
	postTypeObject,
	canAssignAuthor,
} ) {
	const supports = postTypeObject?.supports || {};
	const supportsComments = supports.comments !== false;
	const supportsExcerpt = supports.excerpt !== false;
	const supportsThumbnail = supports.thumbnail !== false;
	// `taxonomies` on the post-type entity is an array of taxonomy slugs/rest
	// bases the type is associated with.
	const taxonomies = postTypeObject?.taxonomies || [];

	const setTermIds = useCallback(
		( field ) => ( ids ) => edit( { [ field ]: ids } ),
		[ edit ]
	);

	return (
		<Fill name="core:editor.sidebar">
			<div className="wp-admin-shell-doc-settings">
				<Text
					variant="heading-md"
					render={ <h2 /> }
					className="wp-admin-shell-doc-settings__title"
				>
					{ __( 'Post', 'wp-admin-shell' ) }
				</Text>

				<PublishPanel editedRecord={ editedRecord } edit={ edit } />
				<SlugPanel editedRecord={ editedRecord } edit={ edit } />

				{ taxonomies.includes( 'category' ) && (
					<Panel
						title={ __( 'Categories', 'wp-admin-shell' ) }
						initialOpen={ false }
					>
						<CategoryChecklist
							restBase="categories"
							value={ editedRecord?.categories }
							onChange={ setTermIds( 'categories' ) }
						/>
					</Panel>
				) }

				{ taxonomies.includes( 'post_tag' ) && (
					<Panel
						title={ __( 'Tags', 'wp-admin-shell' ) }
						initialOpen={ false }
					>
						<TaxonomyTokenField
							label={ __( 'Add tags', 'wp-admin-shell' ) }
							restBase="tags"
							value={ editedRecord?.tags }
							onChange={ setTermIds( 'tags' ) }
						/>
					</Panel>
				) }

				{ supportsExcerpt && (
					<ExcerptPanel editedRecord={ editedRecord } edit={ edit } />
				) }

				{ supportsThumbnail && (
					<FeaturedImagePanel
						editedRecord={ editedRecord }
						edit={ edit }
					/>
				) }

				{ canAssignAuthor && (
					<AuthorPanel editedRecord={ editedRecord } edit={ edit } />
				) }

				<DiscussionPanel
					editedRecord={ editedRecord }
					edit={ edit }
					supportsComments={ supportsComments }
				/>
			</div>
		</Fill>
	);
}
