import './index.css';
import { useMemo } from '@wordpress/element';
import { useEntityRecords } from '@wordpress/core-data';
import { Text } from '@wordpress/ui';
import { __ } from '@wordpress/i18n';
import { EntityDataForm } from '../_shared/forms/EntityDataForm';

const FORM = {
	fields: [
		'show_on_front',
		'page_on_front',
		'page_for_posts',
		'posts_per_page',
		'posts_per_rss',
		'rss_use_excerpt',
	],
};

/**
 * Whether the static-page selects apply. Defaults to `posts` when unset.
 *
 * @param {Object} item Edited site record.
 * @return {boolean} True when a static homepage is selected.
 */
const showsStaticPage = ( item ) =>
	( item.show_on_front || 'posts' ) === 'page';

/**
 * Coerce a per-page count to a positive integer, falling back to 10.
 *
 * The DataForm `integer` control can emit an empty string or 0 when the user
 * clears the field; WordPress treats `posts_per_page = 0` as invalid and breaks
 * front-end pagination. Clamp to a floor of 1 (default 10) so Save can never
 * write a non-positive value — restores the `parseInt(...) || 10` guard the
 * hand-rolled InputControl enforced before the DataForm migration.
 *
 * @param {*} value Raw control value (number or string).
 * @return {number} Positive integer (>= 1), or 10 when empty/invalid.
 */
const clampPerPage = ( value ) => {
	const n = parseInt( value, 10 );
	return Number.isInteger( n ) && n > 0 ? n : 10;
};

export default function SettingsReadingApp() {
	const pages = useEntityRecords( 'postType', 'page', {
		per_page: 100,
		status: 'publish',
		orderby: 'title',
		order: 'asc',
		_fields: 'id,title',
		context: 'edit',
	} );

	const fields = useMemo( () => {
		const pageOptions = [
			{ value: '0', label: __( '— Select —', 'wp-admin-shell' ) },
			...( pages.records || [] ).map( ( p ) => ( {
				value: String( p.id ),
				label: p.title?.rendered || p.title?.raw || `#${ p.id }`,
			} ) ),
		];
		return [
			{
				id: 'show_on_front',
				type: 'text',
				label: __( 'Your homepage displays', 'wp-admin-shell' ),
				Edit: 'radio',
				elements: [
					{
						value: 'posts',
						label: __( 'Your latest posts', 'wp-admin-shell' ),
					},
					{
						value: 'page',
						label: __( 'A static page', 'wp-admin-shell' ),
					},
				],
			},
			{
				id: 'page_on_front',
				type: 'text',
				label: __( 'Homepage', 'wp-admin-shell' ),
				Edit: 'select',
				elements: pageOptions,
				// Opt out of DataViews' implicit elements-membership validation:
				// `pageOptions` is lazy-loaded and capped at `per_page: 100`, so a
				// stored id outside the first page (or a draft/private page, or one
				// still resolving) isn't in the list and would lock Save — even
				// while the select is hidden (validation ignores `isVisible`).
				isValid: { elements: false },
				isVisible: showsStaticPage,
				getValue: ( { item } ) => String( item.page_on_front ?? 0 ),
				setValue: ( { value } ) => ( {
					page_on_front: parseInt( value, 10 ),
				} ),
			},
			{
				id: 'page_for_posts',
				type: 'text',
				label: __( 'Posts page', 'wp-admin-shell' ),
				Edit: 'select',
				elements: pageOptions,
				// Opt out of DataViews' implicit elements-membership validation:
				// `pageOptions` is lazy-loaded and capped at `per_page: 100`, so a
				// stored id outside the first page (or a draft/private page, or one
				// still resolving) isn't in the list and would lock Save — even
				// while the select is hidden (validation ignores `isVisible`).
				isValid: { elements: false },
				isVisible: showsStaticPage,
				getValue: ( { item } ) => String( item.page_for_posts ?? 0 ),
				setValue: ( { value } ) => ( {
					page_for_posts: parseInt( value, 10 ),
				} ),
			},
			{
				id: 'posts_per_page',
				type: 'integer',
				label: __( 'Blog pages show at most', 'wp-admin-shell' ),
				getValue: ( { item } ) => item.posts_per_page ?? 10,
				setValue: ( { value } ) => ( {
					posts_per_page: clampPerPage( value ),
				} ),
			},
			{
				id: 'posts_per_rss',
				type: 'integer',
				label: __(
					'Syndication feeds show the most recent',
					'wp-admin-shell'
				),
				getValue: ( { item } ) => item.posts_per_rss ?? 10,
				setValue: ( { value } ) => ( {
					posts_per_rss: clampPerPage( value ),
				} ),
			},
			{
				id: 'rss_use_excerpt',
				type: 'text',
				label: __(
					'For each post in a feed, include',
					'wp-admin-shell'
				),
				Edit: 'radio',
				elements: [
					{ value: '0', label: __( 'Full text', 'wp-admin-shell' ) },
					{ value: '1', label: __( 'Excerpt', 'wp-admin-shell' ) },
				],
				getValue: ( { item } ) => ( item.rss_use_excerpt ? '1' : '0' ),
				setValue: ( { value } ) => ( {
					rss_use_excerpt: value === '1',
				} ),
			},
		];
	}, [ pages.records ] );

	return (
		<EntityDataForm
			className="wp-admin-shell-app-settings-reading"
			entity={ [ 'root', 'site' ] }
			fields={ fields }
			form={ FORM }
			title={ __( 'Reading', 'wp-admin-shell' ) }
			messages={ {
				success: __( 'Settings saved.', 'wp-admin-shell' ),
				error: __( 'Failed to save settings.', 'wp-admin-shell' ),
			} }
		>
			<Text variant="body-sm">
				{ __(
					'Search-engine visibility (the “discourage search engines” toggle) is not exposed by the REST API. Use the legacy Reading Settings screen for that field.',
					'wp-admin-shell'
				) }
			</Text>
		</EntityDataForm>
	);
}
