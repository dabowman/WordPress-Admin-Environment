import './index.css';
import { __ } from '@wordpress/i18n';
import { EntityDataForm } from '../_shared/forms/EntityDataForm';
import { rangeField } from '../_shared/forms/controls/RangeControl';

// Upper bounds for the slider per dimension class — generous enough to cover
// the realistic range of registered image sizes while keeping the slider
// usable. The number input rides alongside the slider (`RangeControl`'s
// `withInputField` is on by default), so a value can still be typed exactly.
const DIMENSION_MAX = 2048;

/**
 * Build a slider-backed image-dimension field. The shared `rangeField` clamps
 * to `[0, max]` and rounds to an integer in its `setValue`, so a cleared /
 * out-of-range value can never push a negative dimension (the REST schema floor
 * is `minimum: 0`; 0 means "do not generate this size"). The slider replaces the
 * bare numeric input while keeping exact entry via the adjacent number field.
 *
 * @param {string} id    Option name / field id.
 * @param {string} label Visible label.
 * @param {number} [max] Slider upper bound.
 * @return {Object} DataForm field definition.
 */
const dimensionField = ( id, label, max = DIMENSION_MAX ) =>
	rangeField( { id, label, min: 0, max, step: 1 } );

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
