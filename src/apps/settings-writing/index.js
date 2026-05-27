import './index.css';
import { useMemo } from '@wordpress/element';
import { useEntityRecords } from '@wordpress/core-data';
import { Text } from '@wordpress/ui';
import { __ } from '@wordpress/i18n';
import { EntityDataForm } from '../_shared/forms/EntityDataForm';

const POST_FORMAT_OPTIONS = [
	{ value: 'standard', label: __( 'Standard', 'wp-admin-shell' ) },
	{ value: 'aside', label: __( 'Aside', 'wp-admin-shell' ) },
	{ value: 'chat', label: __( 'Chat', 'wp-admin-shell' ) },
	{ value: 'gallery', label: __( 'Gallery', 'wp-admin-shell' ) },
	{ value: 'link', label: __( 'Link', 'wp-admin-shell' ) },
	{ value: 'image', label: __( 'Image', 'wp-admin-shell' ) },
	{ value: 'quote', label: __( 'Quote', 'wp-admin-shell' ) },
	{ value: 'status', label: __( 'Status', 'wp-admin-shell' ) },
	{ value: 'video', label: __( 'Video', 'wp-admin-shell' ) },
	{ value: 'audio', label: __( 'Audio', 'wp-admin-shell' ) },
];

const FORM = {
	fields: [ 'default_category', 'default_post_format' ],
};

export default function SettingsWritingApp() {
	const categories = useEntityRecords( 'taxonomy', 'category', {
		per_page: 100,
		orderby: 'name',
		order: 'asc',
		hide_empty: false,
	} );

	const fields = useMemo( () => {
		const categoryOptions = ( categories.records || [] ).map( ( c ) => ( {
			value: String( c.id ),
			label: c.name,
		} ) );
		return [
			{
				id: 'default_category',
				type: 'text',
				label: __( 'Default Post Category', 'wp-admin-shell' ),
				Edit: 'select',
				elements: categoryOptions,
				getValue: ( { item } ) => String( item.default_category ?? '' ),
				setValue: ( { value } ) => ( {
					default_category: parseInt( value, 10 ),
				} ),
			},
			{
				id: 'default_post_format',
				type: 'text',
				label: __( 'Default Post Format', 'wp-admin-shell' ),
				Edit: 'select',
				elements: POST_FORMAT_OPTIONS,
				getValue: ( { item } ) =>
					item.default_post_format || 'standard',
			},
		];
	}, [ categories.records ] );

	return (
		<EntityDataForm
			className="wp-admin-shell-app-settings-writing"
			entity={ [ 'root', 'site' ] }
			fields={ fields }
			form={ FORM }
			heading={ __( 'Writing', 'wp-admin-shell' ) }
			messages={ {
				success: __( 'Settings saved.', 'wp-admin-shell' ),
				error: __( 'Failed to save settings.', 'wp-admin-shell' ),
			} }
		>
			<Text variant="body-sm">
				{ __(
					'Post via email and remote-publishing settings are not exposed by the WordPress REST API. Use the legacy Writing Settings screen for those fields.',
					'wp-admin-shell'
				) }
			</Text>
		</EntityDataForm>
	);
}
