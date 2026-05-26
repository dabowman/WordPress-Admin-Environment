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
			},
			{
				id: 'posts_per_rss',
				type: 'integer',
				label: __(
					'Syndication feeds show the most recent',
					'wp-admin-shell'
				),
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
			heading={ __( 'Reading', 'wp-admin-shell' ) }
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
