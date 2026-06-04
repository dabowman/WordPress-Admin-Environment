import { MediaUpload } from '@wordpress/media-utils';
import { useEntityRecord } from '@wordpress/core-data';
import { Button, Stack, Text } from '@wordpress/ui';
import { Button as DestructiveButton } from '@wordpress/components';
import { __ } from '@wordpress/i18n';
import {
	normalizeMediaId,
	mediaIdFromSelection,
	pickMediaPreviewUrl,
} from './mediaControl.mjs';

/**
 * Media-library-picker control — the missing DataForm media `Edit` control
 * (parity doc §2.13 / roadmap group C item 8). DataForm ships a `media` field
 * *type* that only *renders* an image; it has no picker. This wraps
 * `@wordpress/media-utils` `MediaUpload` to open the WordPress media modal and
 * stores the chosen **attachment id** — the shape WordPress settings such as
 * `site_icon` / `site_logo` and avatar metas use.
 *
 * `@wordpress/media-utils` externalizes to the core `wp-media-utils` handle and
 * the media modal needs `wp_enqueue_media()` (added to the workspace's PHP
 * enqueue), so no app-side bundling is required.
 *
 * Standalone presentational form (value/onChange) for hand-rolled forms (e.g.
 * the `settings-general` Site Icon section). For DataForm use, see
 * `makeMediaControl` / `mediaField` below.
 *
 * @param {Object}   root0                       Props.
 * @param {number}   root0.value                 Current attachment id (0 = none).
 * @param {Function} root0.onChange              `(id) => void` — receives the new id (0 to clear).
 * @param {string}   [root0.label]               Visible label.
 * @param {string}   [root0.help]                Helper text under the control.
 * @param {string[]} [root0.allowedTypes]        `MediaUpload` allowed MIME groups.
 * @param {string}   [root0.buttonLabel]         Label for the choose button when empty.
 * @param {string}   [root0.previewSize]         Preferred preview image size.
 * @param {boolean}  [root0.hideLabelFromVision] Visually hide the label.
 * @return {JSX.Element} The picker.
 */
export function MediaPicker( {
	value,
	onChange,
	label,
	help,
	allowedTypes = [ 'image' ],
	buttonLabel,
	previewSize = 'thumbnail',
	hideLabelFromVision,
} ) {
	const id = normalizeMediaId( value );

	// Resolve the current attachment for its preview URL. Hook runs
	// unconditionally (rules of hooks); passing `undefined` when nothing is
	// selected keeps core-data from issuing a doomed GET /media/0.
	const { record } = useEntityRecord( 'root', 'media', id || undefined );
	const previewUrl = id ? pickMediaPreviewUrl( record, previewSize ) : '';

	return (
		<Stack
			direction="column"
			gap="sm"
			align="flex-start"
			className="wp-admin-workspaces-media-picker"
		>
			{ label && ! hideLabelFromVision && (
				<Text render={ <span /> }>{ label }</Text>
			) }
			{ previewUrl && (
				<img
					className="wp-admin-workspaces-media-picker__preview"
					src={ previewUrl }
					alt=""
				/>
			) }
			<MediaUpload
				onSelect={ ( selection ) =>
					onChange( mediaIdFromSelection( selection ) )
				}
				allowedTypes={ allowedTypes }
				value={ id || undefined }
				render={ ( { open } ) => (
					<Stack direction="row" gap="sm" align="center">
						<Button
							tone="neutral"
							variant="solid"
							size="compact"
							onClick={ open }
						>
							{ id
								? __( 'Change', 'wp-admin-workspaces' )
								: buttonLabel ||
								  __(
										'Select image',
										'wp-admin-workspaces'
								  ) }
						</Button>
						{ !! id && (
							<DestructiveButton
								isDestructive
								variant="tertiary"
								onClick={ () => onChange( 0 ) }
							>
								{ __( 'Remove', 'wp-admin-workspaces' ) }
							</DestructiveButton>
						) }
					</Stack>
				) }
			/>
			{ help && (
				<Text variant="body-sm" className="wp-admin-workspaces-app__muted">
					{ help }
				</Text>
			) }
		</Stack>
	);
}

/**
 * Range/media parity: a DataForm `Edit` factory wrapping `MediaPicker`. The
 * field stores the attachment id; `getValue`/`setValue` from the normalized
 * field def round-trip it.
 *
 * @param {Object} [opts] `MediaPicker` presentation props (allowedTypes, buttonLabel, previewSize, help).
 * @return {Function} A DataForm `Edit` component.
 */
export function makeMediaControl( opts = {} ) {
	/**
	 * @param {Object}   root0                       DataForm control props.
	 * @param {Object}   root0.data                  The form's working record.
	 * @param {Object}   root0.field                 The normalized field def.
	 * @param {Function} root0.onChange              Commit a partial-record change.
	 * @param {boolean}  [root0.hideLabelFromVision] Visually hide the label.
	 * @return {JSX.Element} The picker control.
	 */
	function MediaFormControl( {
		data,
		field,
		onChange,
		hideLabelFromVision,
	} ) {
		const value = field.getValue
			? field.getValue( { item: data } )
			: data[ field.id ];
		const commit = ( next ) =>
			onChange(
				field.setValue
					? field.setValue( { item: data, value: next } )
					: { [ field.id ]: next }
			);
		return (
			<MediaPicker
				value={ value }
				onChange={ commit }
				label={ field.label }
				hideLabelFromVision={ hideLabelFromVision }
				{ ...opts }
			/>
		);
	}
	return MediaFormControl;
}

/**
 * Convenience: build a complete DataForm field def backed by the media picker.
 *
 * @param {Object}   spec               Field spec.
 * @param {string}   spec.id            Field / option id.
 * @param {string}   spec.label         Visible label.
 * @param {string[]} [spec.allowedTypes] `MediaUpload` allowed MIME groups.
 * @param {string}   [spec.buttonLabel] Choose-button label when empty.
 * @param {string}   [spec.previewSize] Preferred preview image size.
 * @param {string}   [spec.help]        Helper text.
 * @return {Object} A DataForm field definition.
 */
export function mediaField( {
	id,
	label,
	allowedTypes,
	buttonLabel,
	previewSize,
	help,
	...rest
} ) {
	return {
		id,
		label,
		type: 'integer',
		Edit: makeMediaControl( {
			allowedTypes,
			buttonLabel,
			previewSize,
			help,
		} ),
		setValue: ( { value } ) => ( { [ id ]: normalizeMediaId( value ) } ),
		...rest,
	};
}
