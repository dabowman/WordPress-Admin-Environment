import './index.css';
import { __ } from '@wordpress/i18n';
import { EntityDataForm } from '../_shared/forms/EntityDataForm';

// Core's default `thread_comments_depth_max` (filterable server-side via the
// `thread_comments_depth_max` filter). The shell hardcodes 10 as a documented
// parity caveat — there is no read endpoint for the live filtered max, and the
// server-side `thread_comments_depth` sanitize_callback honors the real filter
// regardless, so a theme raising the max still validates (the picker just
// doesn't surface the extra levels).
const THREAD_DEPTH_MAX = 10;

const THREAD_DEPTH_OPTIONS = Array.from(
	{ length: THREAD_DEPTH_MAX - 1 },
	( _, i ) => {
		const n = i + 2; // 2..THREAD_DEPTH_MAX
		return { value: String( n ), label: String( n ) };
	}
);

const AVATAR_RATING_OPTIONS = [
	{
		value: 'G',
		label: __( 'G — Suitable for all audiences', 'wp-admin-shell' ),
	},
	{
		value: 'PG',
		label: __(
			'PG — Possibly offensive, usually for audiences 13 and above',
			'wp-admin-shell'
		),
	},
	{
		value: 'R',
		label: __(
			'R — Intended for adult audiences above 17',
			'wp-admin-shell'
		),
	},
	{
		value: 'X',
		label: __( 'X — Even more mature than above', 'wp-admin-shell' ),
	},
];

const AVATAR_DEFAULT_OPTIONS = [
	{ value: 'mystery', label: __( 'Mystery Person', 'wp-admin-shell' ) },
	{ value: 'blank', label: __( 'Blank', 'wp-admin-shell' ) },
	{
		value: 'gravatar_default',
		label: __( 'Gravatar Logo', 'wp-admin-shell' ),
	},
	{
		value: 'identicon',
		label: __( 'Identicon (Generated)', 'wp-admin-shell' ),
	},
	{ value: 'wavatar', label: __( 'Wavatar (Generated)', 'wp-admin-shell' ) },
	{
		value: 'monsterid',
		label: __( 'MonsterID (Generated)', 'wp-admin-shell' ),
	},
	{ value: 'retro', label: __( 'Retro (Generated)', 'wp-admin-shell' ) },
	{
		value: 'robohash',
		label: __( 'RoboHash (Generated)', 'wp-admin-shell' ),
	},
	{
		value: 'initials',
		label: __( 'Initials (Generated)', 'wp-admin-shell' ),
	},
	{ value: 'color', label: __( 'Color (Generated)', 'wp-admin-shell' ) },
];

const COMMENTS_PAGE_OPTIONS = [
	{ value: 'newest', label: __( 'last page', 'wp-admin-shell' ) },
	{ value: 'oldest', label: __( 'first page', 'wp-admin-shell' ) },
];

const COMMENT_ORDER_OPTIONS = [
	{
		value: 'asc',
		label: __( 'older comments at the top', 'wp-admin-shell' ),
	},
	{
		value: 'desc',
		label: __( 'newer comments at the top', 'wp-admin-shell' ),
	},
];

/**
 * Coerce a non-negative integer with a floor.
 *
 * @param {*}      value Raw control value.
 * @param {number} floor Minimum allowed value.
 * @return {number} Clamped integer.
 */
const clampInt = ( value, floor ) => {
	const n = parseInt( value, 10 );
	return Number.isInteger( n ) && n >= floor ? n : floor;
};

const FIELDS = [
	// --- Default post settings ---------------------------------------------
	// `default_comment_status` / `default_ping_status` round-trip as
	// `open` / `closed` strings; the checkbox wants a boolean, so map both ways.
	{
		id: 'default_pingback_flag',
		type: 'boolean',
		label: __(
			'Attempt to notify any blogs linked to from the post',
			'wp-admin-shell'
		),
	},
	{
		id: 'default_ping_status',
		type: 'boolean',
		label: __(
			'Allow link notifications from other blogs (pingbacks and trackbacks) on new posts',
			'wp-admin-shell'
		),
		getValue: ( { item } ) => item.default_ping_status === 'open',
		setValue: ( { value } ) => ( {
			default_ping_status: value ? 'open' : 'closed',
		} ),
	},
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

	// --- Other comment settings --------------------------------------------
	{
		id: 'require_name_email',
		type: 'boolean',
		label: __(
			'Comment author must fill out name and email',
			'wp-admin-shell'
		),
	},
	{
		id: 'comment_registration',
		type: 'boolean',
		label: __(
			'Users must be registered and logged in to comment',
			'wp-admin-shell'
		),
	},
	{
		id: 'close_comments_for_old_posts',
		type: 'boolean',
		label: __(
			'Automatically close comments on old posts',
			'wp-admin-shell'
		),
	},
	{
		id: 'close_comments_days_old',
		type: 'integer',
		label: __( 'Close comments when posts are days old', 'wp-admin-shell' ),
		// Nested under close_comments_for_old_posts.
		isVisible: ( item ) => !! item.close_comments_for_old_posts,
		getValue: ( { item } ) => item.close_comments_days_old ?? 14,
		setValue: ( { value } ) => ( {
			close_comments_days_old: clampInt( value, 0 ),
		} ),
	},
	{
		id: 'show_comments_cookies_opt_in',
		type: 'boolean',
		label: __(
			'Show comments cookies opt-in checkbox, allowing comment author cookies to be set',
			'wp-admin-shell'
		),
	},
	{
		id: 'thread_comments',
		type: 'boolean',
		label: __( 'Enable threaded (nested) comments', 'wp-admin-shell' ),
	},
	{
		id: 'thread_comments_depth',
		type: 'text',
		label: __( 'levels deep', 'wp-admin-shell' ),
		Edit: 'select',
		elements: THREAD_DEPTH_OPTIONS,
		// Opt out of elements-membership validation: a server-side filter can
		// raise the max above the hardcoded 10, so a stored value past the list
		// (or while the select is hidden) must not lock Save.
		isValid: { elements: false },
		isVisible: ( item ) => !! item.thread_comments,
		getValue: ( { item } ) => String( item.thread_comments_depth ?? 5 ),
		setValue: ( { value } ) => ( {
			thread_comments_depth: clampInt( value, 1 ),
		} ),
	},

	// --- Comment pagination -------------------------------------------------
	{
		id: 'page_comments',
		type: 'boolean',
		label: __( 'Break comments into pages', 'wp-admin-shell' ),
	},
	{
		id: 'comments_per_page',
		type: 'integer',
		label: __( 'Top level comments per page', 'wp-admin-shell' ),
		isVisible: ( item ) => !! item.page_comments,
		getValue: ( { item } ) => item.comments_per_page ?? 50,
		setValue: ( { value } ) => ( {
			comments_per_page: clampInt( value, 1 ),
		} ),
	},
	{
		id: 'default_comments_page',
		type: 'text',
		label: __( 'Comments page displayed by default', 'wp-admin-shell' ),
		Edit: 'select',
		elements: COMMENTS_PAGE_OPTIONS,
		isVisible: ( item ) => !! item.page_comments,
		getValue: ( { item } ) => item.default_comments_page || 'newest',
	},
	{
		id: 'comment_order',
		type: 'text',
		label: __(
			'Comments displayed at the top of each page',
			'wp-admin-shell'
		),
		Edit: 'select',
		elements: COMMENT_ORDER_OPTIONS,
		isVisible: ( item ) => !! item.page_comments,
		getValue: ( { item } ) => item.comment_order || 'asc',
	},

	// --- Email me whenever --------------------------------------------------
	{
		id: 'comments_notify',
		type: 'boolean',
		label: __( 'Anyone posts a comment', 'wp-admin-shell' ),
	},
	{
		id: 'moderation_notify',
		type: 'boolean',
		label: __( 'A comment is held for moderation', 'wp-admin-shell' ),
	},

	// --- Before a comment appears ------------------------------------------
	{
		id: 'comment_moderation',
		type: 'boolean',
		label: __( 'Comment must be manually approved', 'wp-admin-shell' ),
	},
	{
		id: 'comment_previously_approved',
		type: 'boolean',
		label: __(
			'Comment author must have a previously approved comment',
			'wp-admin-shell'
		),
	},

	// --- Comment moderation -------------------------------------------------
	{
		id: 'comment_max_links',
		type: 'integer',
		label: __(
			'Hold a comment in the queue if it contains this many or more links',
			'wp-admin-shell'
		),
		getValue: ( { item } ) => item.comment_max_links ?? 2,
		setValue: ( { value } ) => ( {
			comment_max_links: clampInt( value, 0 ),
		} ),
	},
	{
		id: 'moderation_keys',
		type: 'text',
		label: __( 'Comment Moderation keywords', 'wp-admin-shell' ),
		Edit: 'textarea',
		getValue: ( { item } ) => item.moderation_keys ?? '',
	},
	{
		id: 'disallowed_keys',
		type: 'text',
		label: __( 'Disallowed Comment Keys', 'wp-admin-shell' ),
		Edit: 'textarea',
		getValue: ( { item } ) => item.disallowed_keys ?? '',
	},

	// --- Avatars ------------------------------------------------------------
	{
		id: 'show_avatars',
		type: 'boolean',
		label: __( 'Show Avatars', 'wp-admin-shell' ),
	},
	{
		id: 'avatar_rating',
		type: 'text',
		label: __( 'Maximum Rating', 'wp-admin-shell' ),
		Edit: 'radio',
		elements: AVATAR_RATING_OPTIONS,
		isVisible: ( item ) => !! item.show_avatars,
		getValue: ( { item } ) => item.avatar_rating || 'G',
	},
	{
		id: 'avatar_default',
		type: 'text',
		label: __( 'Default Avatar', 'wp-admin-shell' ),
		Edit: 'radio',
		elements: AVATAR_DEFAULT_OPTIONS,
		isVisible: ( item ) => !! item.show_avatars,
		getValue: ( { item } ) => item.avatar_default || 'mystery',
	},
];

const FORM = {
	fields: FIELDS.map( ( f ) => f.id ),
};

/**
 * core:settings-discussion — standalone Discussion-settings panel.
 *
 * DataForm over the full standard Discussion option set. Core only
 * REST-registers `default_comment_status` / `default_ping_status`; the plugin's
 * `register_setting('discussion', …, { show_in_rest })` shims (issue #118)
 * expose the rest — comment rules, moderation, notifications, threading /
 * paging, and avatars — so the whole panel saves through one `/wp/v2/settings`
 * PUT. Nested groups (close-comments days, thread depth, pagination subset,
 * avatar rating + default) gate on their parent toggle via `isVisible`.
 *
 * @return {JSX.Element} The Discussion settings panel.
 */
export default function SettingsDiscussionApp() {
	return (
		<EntityDataForm
			className="wp-admin-shell-app-settings-discussion"
			entity={ [ 'root', 'site' ] }
			fields={ FIELDS }
			form={ FORM }
			title={ __( 'Discussion', 'wp-admin-shell' ) }
			messages={ {
				success: __( 'Settings saved.', 'wp-admin-shell' ),
				error: __( 'Failed to save settings.', 'wp-admin-shell' ),
			} }
		/>
	);
}
