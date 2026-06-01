import './index.css';
import { useMemo } from '@wordpress/element';
import { useEntityRecords } from '@wordpress/core-data';
import { Stack, Text } from '@wordpress/ui';
import { __ } from '@wordpress/i18n';
import { EntityDataForm } from '../_shared/forms/EntityDataForm';
import { UnavailableViaApi } from '../_shared/fallback/UnavailableViaApi';

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

// Legacy Writing options with no REST surface. Every modern Writing option is
// already REST (`default_category`, `default_post_format`, rendered above);
// these four are legacy — Post-via-Email (`mailserver_*`), Update Services
// (`ping_sites`), Link Manager (`default_link_category`), and `use_balanceTags`.
// Instead of silently hiding them we surface them through the shared No-API
// Fallback (issue #118 / #216) — a classic-screen link + a copy-paste
// `wp option update` command + an agent prompt per option. We DELIBERATELY omit
// `mailserver_pass` (the Post-via-Email password) — it is kept out of REST and
// must not be pre-filled into a copy-paste affordance.
const LEGACY_WRITING_OPTIONS = [
	{
		name: 'mailserver_url',
		label: __( 'Mail Server (Post via Email)', 'wp-admin-shell' ),
	},
	{
		name: 'mailserver_login',
		label: __( 'Mail Server Login (Post via Email)', 'wp-admin-shell' ),
	},
	{
		name: 'mailserver_port',
		label: __( 'Mail Server Port (Post via Email)', 'wp-admin-shell' ),
	},
	{
		name: 'default_email_category',
		label: __( 'Default Mail Category (Post via Email)', 'wp-admin-shell' ),
	},
	{
		name: 'ping_sites',
		label: __( 'Update Services', 'wp-admin-shell' ),
	},
	{
		name: 'default_link_category',
		label: __( 'Default Link Category', 'wp-admin-shell' ),
	},
	{
		name: 'use_balanceTags',
		label: __(
			'Correct invalidly nested XHTML automatically',
			'wp-admin-shell'
		),
	},
];

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
				// Opt out of DataViews' implicit elements-membership validation:
				// `categoryOptions` is lazy-loaded and capped at `per_page: 100`, so a
				// default category beyond the first page (or an unset `''`) isn't in
				// the list and would lock Save on an otherwise-valid panel.
				isValid: { elements: false },
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
			<Stack direction="column" gap="md">
				<Text variant="heading-md" render={ <h3 /> }>
					{ __(
						'Settings not available through the workspace API',
						'wp-admin-shell'
					) }
				</Text>
				<Text variant="body-sm">
					{ __(
						'Post via email, update services, the Link Manager default category, and the XHTML auto-correction toggle have no REST surface. Use the classic screen, WP-CLI, or your coding agent to change them.',
						'wp-admin-shell'
					) }
				</Text>
				{ LEGACY_WRITING_OPTIONS.map( ( option ) => (
					<Stack key={ option.name } direction="column" gap="xs">
						<Text variant="body-sm">
							<strong>{ option.label }</strong>
						</Text>
						<UnavailableViaApi
							kind="option"
							name={ option.name }
							classicPath="options-writing.php"
						/>
					</Stack>
				) ) }
			</Stack>
		</EntityDataForm>
	);
}
