import './index.css';
import { Text } from '@wordpress/ui';
import { __ } from '@wordpress/i18n';
import { EntityDataForm } from '../_shared/forms/EntityDataForm';

// `default_comment_status` / `default_ping_status` round-trip as `open` /
// `closed` strings; the checkbox control wants a boolean, so map both ways via
// getValue/setValue. These two fields are the canonical "Default post settings"
// — they live here, not on the Reading panel.
const FIELDS = [
	{
		id: 'default_comment_status',
		type: 'boolean',
		label: __(
			'Allow people to submit comments on new posts',
			'wp-admin-shell'
		),
		getValue: ( { item } ) => item.default_comment_status === 'open',
		setValue: ( { value } ) => ( {
			default_comment_status: value ? 'open' : 'closed',
		} ),
	},
	{
		id: 'default_ping_status',
		type: 'boolean',
		label: __(
			'Allow link notifications from other blogs (pingbacks and trackbacks)',
			'wp-admin-shell'
		),
		getValue: ( { item } ) => item.default_ping_status === 'open',
		setValue: ( { value } ) => ( {
			default_ping_status: value ? 'open' : 'closed',
		} ),
	},
];

const FORM = {
	fields: [ 'default_comment_status', 'default_ping_status' ],
};

export default function SettingsDiscussionApp() {
	return (
		<EntityDataForm
			className="wp-admin-shell-app-settings-discussion"
			entity={ [ 'root', 'site' ] }
			fields={ FIELDS }
			form={ FORM }
			heading={ __( 'Discussion', 'wp-admin-shell' ) }
			messages={ {
				success: __( 'Settings saved.', 'wp-admin-shell' ),
				error: __( 'Failed to save settings.', 'wp-admin-shell' ),
			} }
		>
			<Text variant="body-sm">
				{ __(
					'The fine-grained discussion settings (comment moderation rules, blocklists, avatars) are not exposed by the WordPress REST API. Use the legacy Discussion Settings screen for those fields.',
					'wp-admin-shell'
				) }
			</Text>
		</EntityDataForm>
	);
}
