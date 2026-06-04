import './index.css';
import { __ } from '@wordpress/i18n';
import { EntityDataForm } from '../_shared/forms/EntityDataForm';

/**
 * Coerce an image-dimension value to a non-negative integer.
 *
 * The DataForm `integer` control can emit an empty string or a negative number
 * when the field is cleared. WordPress treats a dimension of 0 as "do not
 * generate this size", but a negative value is meaningless and the REST schema
 * floor (registered server-side at `minimum: 0`) would 400 it. Clamp client-side
 * to a floor of 0 so Save can never push a negative dimension.
 *
 * @param {*} value Raw control value (number or string).
 * @return {number} Non-negative integer (>= 0), or 0 when empty/invalid.
 */
const clampDimension = ( value ) => {
	const n = parseInt( value, 10 );
	return Number.isInteger( n ) && n > 0 ? n : 0;
};

/**
 * Build an integer dimension field def with the non-negative clamp.
 *
 * @param {string} id    Option name / field id.
 * @param {string} label Visible label.
 * @return {Object} DataForm field definition.
 */
const dimensionField = ( id, label ) => ( {
	id,
	type: 'integer',
	label,
	getValue: ( { item } ) => item[ id ] ?? 0,
	setValue: ( { value } ) => ( { [ id ]: clampDimension( value ) } ),
} );

const FIELDS = [
	dimensionField(
		'thumbnail_size_w',
		__( 'Thumbnail width', 'wp-admin-workspaces' )
	),
	dimensionField(
		'thumbnail_size_h',
		__( 'Thumbnail height', 'wp-admin-workspaces' )
	),
	{
		id: 'thumbnail_crop',
		type: 'boolean',
		label: __(
			'Crop thumbnail to exact dimensions (normally thumbnails are proportional)',
			'wp-admin-workspaces'
		),
	},
	dimensionField(
		'medium_size_w',
		__( 'Medium size max width', 'wp-admin-workspaces' )
	),
	dimensionField(
		'medium_size_h',
		__( 'Medium size max height', 'wp-admin-workspaces' )
	),
	dimensionField(
		'large_size_w',
		__( 'Large size max width', 'wp-admin-workspaces' )
	),
	dimensionField(
		'large_size_h',
		__( 'Large size max height', 'wp-admin-workspaces' )
	),
	{
		id: 'uploads_use_yearmonth_folders',
		type: 'boolean',
		label: __(
			'Organize my uploads into month- and year-based folders',
			'wp-admin-workspaces'
		),
	},
];

const FORM = {
	fields: [
		'thumbnail_size_w',
		'thumbnail_size_h',
		'thumbnail_crop',
		'medium_size_w',
		'medium_size_h',
		'large_size_w',
		'large_size_h',
		'uploads_use_yearmonth_folders',
	],
};

/**
 * core:settings-media — standalone Media-settings panel.
 *
 * DataForm over the REST-exposed slice of WordPress's Media Settings: the
 * thumbnail / medium / large image dimensions, the thumbnail-crop flag, and the
 * year/month uploads-folder flag. The plugin's `register_setting` shims expose
 * these eight options through `/wp/v2/settings`; this app reads + writes them
 * via `useEntityRecord('root','site')` through the shared `EntityDataForm`.
 *
 * @return {JSX.Element} The Media settings panel.
 */
export default function SettingsMediaApp() {
	return (
		<EntityDataForm
			className="wp-admin-workspaces-app-settings-media"
			entity={ [ 'root', 'site' ] }
			fields={ FIELDS }
			form={ FORM }
			title={ __( 'Media', 'wp-admin-workspaces' ) }
			messages={ {
				success: __( 'Settings saved.', 'wp-admin-workspaces' ),
				error: __( 'Failed to save settings.', 'wp-admin-workspaces' ),
			} }
		/>
	);
}
