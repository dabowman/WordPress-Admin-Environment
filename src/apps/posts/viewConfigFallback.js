import { __ } from '@wordpress/i18n';

/**
 * Built-in view-config fallback for `(postType, post)`.
 *
 * PostsApp reads its DataViews spec via `useViewConfig` so plugins can
 * extend / replace fields, actions, and default view through the
 * cascade or `wp_admin_shell_view_config_postType_post` filter. When
 * the cascade has no entry for the current triple, this baked-in
 * fallback keeps the app rendering — every action/field id matches a
 * renderer in `index.js`'s `RENDERERS` + `ACTION_RUNNERS` tables.
 *
 * JSON-only: render callbacks live in the React side; this file
 * declares the structural shape (ids, types, labels, primacy,
 * destructiveness).
 */
export const POSTS_VIEW_CONFIG_FALLBACK = {
	kind: 'postType',
	name: 'post',
	defaultView: {
		type: 'table',
		search: '',
		filters: [],
		page: 1,
		perPage: 20,
		sort: { field: 'date', direction: 'desc' },
		fields: [ 'title', 'status', 'author', 'date' ],
		titleField: 'title',
		layout: {},
	},
	defaultLayouts: { table: {}, grid: {} },
	fields: [
		{
			id: 'title',
			type: 'text',
			label: __( 'Title', 'wp-admin-shell' ),
			enableGlobalSearch: true,
			enableHiding: false,
		},
		{
			id: 'status',
			type: 'text',
			label: __( 'Status', 'wp-admin-shell' ),
			filterBy: { operators: [ 'isAny' ] },
		},
		{
			id: 'author',
			type: 'text',
			label: __( 'Author', 'wp-admin-shell' ),
		},
		{
			id: 'date',
			type: 'datetime',
			label: __( 'Date', 'wp-admin-shell' ),
		},
	],
	actions: [
		{
			id: 'edit',
			label: __( 'Edit', 'wp-admin-shell' ),
			isPrimary: true,
			icon: 'pencil',
		},
		{
			id: 'view',
			label: __( 'View', 'wp-admin-shell' ),
			icon: 'external',
			eligibleWhen: { status: 'publish' },
		},
		{
			id: 'trash',
			label: __( 'Move to Trash', 'wp-admin-shell' ),
			isDestructive: true,
			supportsBulk: true,
			icon: 'trash',
		},
	],
};
