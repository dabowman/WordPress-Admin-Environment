import { __ } from '@wordpress/i18n';

/**
 * Standard WordPress role display names, used as a translated fallback when the
 * resolved dataView spec does not ship `roles` elements (e.g. a leaner override
 * that drops them). Workspace-authored elements win when present.
 *
 * Shared by the users list (`core:users`) and the Add New User screen
 * (`core:user-new`) — promoted here once a second consumer appeared (CLAUDE.md
 * "promote to a shared location only when a second consumer appears").
 */
export const STANDARD_ROLE_LABELS = {
	administrator: __( 'Administrator', 'wp-admin-workspaces' ),
	editor: __( 'Editor', 'wp-admin-workspaces' ),
	author: __( 'Author', 'wp-admin-workspaces' ),
	contributor: __( 'Contributor', 'wp-admin-workspaces' ),
	subscriber: __( 'Subscriber', 'wp-admin-workspaces' ),
};

/**
 * Standard WordPress roles ordered lowest- to highest-privilege. The standard
 * fallback set surfaced when the resolved spec ships no `roles` elements; the
 * leading entry (`subscriber`) is also the lowest-privilege default new-user
 * role.
 */
export const DEFAULT_ROLES = [
	'subscriber',
	'contributor',
	'author',
	'editor',
	'administrator',
];

/**
 * Map a role slug to its translated display name. Prefers the workspace-authored
 * `roles` field `elements` (so workspace.json controls the surfaced set + labels),
 * falling back to the standard-role table, then the raw slug.
 *
 * @param {string} slug           Role slug.
 * @param {Object} [elementLabel] `value` → `label` map from the spec elements.
 * @return {string} Display name.
 */
export function roleDisplayName( slug, elementLabel = {} ) {
	return elementLabel[ slug ] ?? STANDARD_ROLE_LABELS[ slug ] ?? slug;
}
