<?php
/**
 * v3 permissions resolver — OR-semantic capabilities + roles.
 *
 * Each screen in v3 ships a `permissions` block of the shape:
 *
 *   {
 *     "capabilities": [ "edit_posts" ],
 *     "roles":        [ "administrator", "super-admin" ]
 *   }
 *
 * OR semantics. A user passes the screen if they hold ANY listed
 * capability OR belong to ANY listed role. Between the two fields the
 * result is OR-ed together.
 *
 * Atop the per-screen OR-set sits the mounted app's manifest
 * `capabilities[]`, which is AND-required and untouchable by any
 * workspace declaration. The OR-set declares "permitted access routes";
 * the app floor declares "absolute requirements no workspace can lower".
 *
 * Trust-tier cascade rule.
 *   core / engine / plugin / site  — may ADD or REMOVE from the OR-set.
 *   role / user                     — may only REMOVE. Their permissions
 *                                     get intersected against the merged
 *                                     trusted baseline. Attempts to GROW
 *                                     the set are rejected with an audit
 *                                     entry; trusted entries pass through.
 *
 * Unknown values fail closed. A capability slug not registered in WP
 * (`get_role()`/`wp_roles()->get_capabilities()` walk produces no hit)
 * or a role slug not registered (`wp_roles()->is_role()`) is treated as
 * permanently unsatisfiable — no user can hold it. The screen still
 * mounts for users passing other known requirements in the OR-set; if
 * the entire OR-set is unknown, the screen reduces to "deny everyone".
 * `WP_DEBUG` logs warnings to `error_log`.
 *
 * Magic value: `"super-admin"` in the roles array routes through
 * `is_super_admin($user_id)` rather than direct `$user->roles`
 * membership — multisite-aware.
 *
 * @package WP_Admin_Shell
 */

defined( 'ABSPATH' ) || exit;

class WP_Admin_Shell_Permissions {

	/** Origins that may both add to and remove from the OR-set. */
	const ADD_REMOVE_ORIGINS = array( 'core', 'engine', 'plugin', 'site' );

	/** Origins restricted to REMOVE-only (shrink the OR-set). */
	const REMOVE_ONLY_ORIGINS = array( 'role', 'user' );

	/**
	 * Resolver-side enforcement entry point. Called from
	 * `WP_Admin_Shell_Resolver::resolve_with()` after each consumer-origin
	 * filter pass, BEFORE the merge. Walks every
	 * `screens[id].permissions` block in the incoming origin doc and
	 * applies the shrink-only rule for role / user origins: any cap or
	 * role the consumer attempts to add that isn't in the trusted-merged
	 * baseline gets stripped + audit-logged.
	 *
	 * Trusted-tier origins (core / engine / plugin / site) pass through
	 * untouched — they own the doc shape.
	 *
	 * @param array  $origin_doc    The single-origin doc about to be merged.
	 * @param array  $merged_so_far The merged tree from previous origins.
	 * @param string $origin        The origin name (`role` / `user` / etc).
	 * @return array The (potentially stripped) origin doc.
	 */
	public static function enforce_origin_tier( $origin_doc, $merged_so_far, $origin ) {
		if ( in_array( $origin, self::ADD_REMOVE_ORIGINS, true ) ) {
			return $origin_doc;
		}
		if ( ! in_array( $origin, self::REMOVE_ONLY_ORIGINS, true ) ) {
			return $origin_doc;
		}
		if ( ! is_array( $origin_doc ) || empty( $origin_doc['screens'] ) || ! is_array( $origin_doc['screens'] ) ) {
			return $origin_doc;
		}

		$baseline_screens = isset( $merged_so_far['screens'] ) && is_array( $merged_so_far['screens'] )
			? $merged_so_far['screens']
			: array();

		foreach ( $origin_doc['screens'] as $screen_id => $screen ) {
			if ( ! is_array( $screen ) || ! isset( $screen['permissions'] ) || ! is_array( $screen['permissions'] ) ) {
				continue;
			}
			$baseline_perms = isset( $baseline_screens[ $screen_id ]['permissions'] ) && is_array( $baseline_screens[ $screen_id ]['permissions'] )
				? $baseline_screens[ $screen_id ]['permissions']
				: array( 'capabilities' => array(), 'roles' => array() );

			$origin_doc['screens'][ $screen_id ]['permissions'] = self::shrink_against_baseline(
				$screen['permissions'],
				$baseline_perms,
				$origin,
				(string) $screen_id
			);
		}
		return $origin_doc;
	}

	/**
	 * Apply shrink-only enforcement: drop any cap or role from the
	 * consumer-origin permissions that isn't already present in the
	 * trusted baseline. Each dropped entry produces an audit log
	 * entry + WP_DEBUG error_log line.
	 *
	 * @param array  $consumer_perms { capabilities, roles } from consumer origin
	 * @param array  $baseline_perms { capabilities, roles } from merged trusted baseline
	 * @param string $origin
	 * @param string $screen_id
	 * @return array { capabilities, roles } — guaranteed subset of baseline
	 */
	private static function shrink_against_baseline( $consumer_perms, $baseline_perms, $origin, $screen_id ) {
		$consumer_caps  = self::sanitize_string_list( $consumer_perms['capabilities'] ?? array() );
		$consumer_roles = self::sanitize_string_list( $consumer_perms['roles'] ?? array() );
		$baseline_caps  = self::sanitize_string_list( $baseline_perms['capabilities'] ?? array() );
		$baseline_roles = self::sanitize_string_list( $baseline_perms['roles'] ?? array() );

		$out_caps  = array();
		foreach ( $consumer_caps as $cap ) {
			if ( in_array( $cap, $baseline_caps, true ) ) {
				$out_caps[] = $cap;
				continue;
			}
			self::$audit[] = array(
				'origin'    => $origin,
				'screen'    => $screen_id,
				'kind'      => 'capability',
				'attempted' => 'add',
				'detail'    => sprintf(
					'origin "%1$s" attempted to add capability "%2$s" to screen "%3$s" permissions OR-set (consumer origins may only remove)',
					$origin,
					$cap,
					$screen_id
				),
			);
			if ( defined( 'WP_DEBUG' ) && WP_DEBUG ) {
				error_log( sprintf(
					'[wp-admin-shell] trust-tier violation: %s origin tried to add capability "%s" to screen "%s" OR-set; rejected.',
					$origin,
					$cap,
					$screen_id
				) );
			}
		}

		$out_roles = array();
		foreach ( $consumer_roles as $role ) {
			if ( in_array( $role, $baseline_roles, true ) ) {
				$out_roles[] = $role;
				continue;
			}
			self::$audit[] = array(
				'origin'    => $origin,
				'screen'    => $screen_id,
				'kind'      => 'role',
				'attempted' => 'add',
				'detail'    => sprintf(
					'origin "%1$s" attempted to add role "%2$s" to screen "%3$s" permissions OR-set (consumer origins may only remove)',
					$origin,
					$role,
					$screen_id
				),
			);
			if ( defined( 'WP_DEBUG' ) && WP_DEBUG ) {
				error_log( sprintf(
					'[wp-admin-shell] trust-tier violation: %s origin tried to add role "%s" to screen "%s" OR-set; rejected.',
					$origin,
					$role,
					$screen_id
				) );
			}
		}

		return array(
			'capabilities' => array_values( array_unique( $out_caps ) ),
			'roles'        => array_values( array_unique( $out_roles ) ),
		);
	}

	/** Multisite magic value — triggers `is_super_admin()`. */
	const SUPER_ADMIN_ROLE = 'super-admin';

	/** Audit log of trust-tier violations during the most recent resolve. */
	private static $audit = array();

	/**
	 * Default permissions when a screen ships no `permissions` block.
	 * Admin-only — secure by default. Larger installs broaden access by
	 * explicitly authoring permissions per screen.
	 *
	 * @return array
	 */
	public static function default_permissions() {
		return array(
			'capabilities' => array(),
			'roles'        => array( 'administrator', self::SUPER_ADMIN_ROLE ),
		);
	}

	/**
	 * Reset the audit log. Tests call this between fixtures; the resolver
	 * calls it at the top of `resolve_screens()` so each cascade pass
	 * starts with a clean log.
	 */
	public static function reset_audit() {
		self::$audit = array();
	}

	/**
	 * Return the audit log. Each entry: [ 'origin', 'screen', 'kind',
	 * 'attempted', 'detail' ].
	 *
	 * @return array
	 */
	public static function get_audit() {
		return self::$audit;
	}

	/**
	 * Resolve a screen's permissions to canonical shape.
	 *
	 * @param array|null $screen_perms Raw `screen.permissions` (may be null/empty).
	 * @param string[]   $app_floor    AND-required capability list from app manifest.
	 * @return array { capabilities: string[], roles: string[], appFloor: string[] }
	 */
	public static function resolve( $screen_perms, $app_floor = array() ) {
		$caps  = array();
		$roles = array();

		if ( is_array( $screen_perms ) ) {
			$caps  = self::sanitize_string_list( $screen_perms['capabilities'] ?? array() );
			$roles = self::sanitize_string_list( $screen_perms['roles'] ?? array() );
		} else {
			$defaults = self::default_permissions();
			$caps     = $defaults['capabilities'];
			$roles    = $defaults['roles'];
		}

		// Empty block (both arrays empty) still means "default admin-only"
		// — authors who want true public access must declare at least one
		// cap or role. Fail-closed by convention.
		if ( empty( $caps ) && empty( $roles ) ) {
			$defaults = self::default_permissions();
			$caps     = $defaults['capabilities'];
			$roles    = $defaults['roles'];
		}

		return array(
			'capabilities' => array_values( array_unique( $caps ) ),
			'roles'        => array_values( array_unique( $roles ) ),
			'appFloor'     => array_values( array_unique( self::sanitize_string_list( $app_floor ) ) ),
		);
	}

	/**
	 * Enforce trust tiers across per-origin permission contributions.
	 *
	 * Walks the origin contributions in order, builds an intermediate
	 * "trusted baseline" from core/engine/plugin/site, then intersects
	 * role + user contributions against that baseline. Any cap/role the
	 * role or user origin attempts to ADD that wasn't in the trusted
	 * baseline gets rejected and logged.
	 *
	 * The resolver normally relies on the cascade merge engine to
	 * combine origins — this method exists for the cases where origin
	 * provenance MUST be preserved through the merge (e.g. when origin
	 * tags are stripped before the screen-level permissions block is
	 * processed). It also serves as the standalone test surface for the
	 * trust-tier rule.
	 *
	 * @param array  $per_origin    [ origin => permissions ].
	 * @param string $screen_id     For audit log entries.
	 * @return array Merged permissions { capabilities, roles }.
	 */
	public static function enforce_trust_tiers( $per_origin, $screen_id = '' ) {
		$trusted_caps  = array();
		$trusted_roles = array();

		// Pass 1 — accumulate the trusted baseline.
		foreach ( self::ADD_REMOVE_ORIGINS as $origin ) {
			if ( ! isset( $per_origin[ $origin ] ) || ! is_array( $per_origin[ $origin ] ) ) {
				continue;
			}
			$caps  = self::sanitize_string_list( $per_origin[ $origin ]['capabilities'] ?? array() );
			$roles = self::sanitize_string_list( $per_origin[ $origin ]['roles'] ?? array() );

			// Trusted origin can REMOVE by simply not echoing an entry —
			// but to preserve cascade order across multiple trusted origins
			// we union here. The merge step handles tombstone removal
			// elsewhere; this is the trust-tier check, not the merge.
			$trusted_caps  = array_unique( array_merge( $trusted_caps, $caps ) );
			$trusted_roles = array_unique( array_merge( $trusted_roles, $roles ) );
		}

		$out_caps  = $trusted_caps;
		$out_roles = $trusted_roles;

		// Pass 2 — consumer origins. Allowed to remove (we accept their
		// list as the intersection); rejecting any add (anything in
		// consumer-list not in baseline is logged + dropped).
		foreach ( self::REMOVE_ONLY_ORIGINS as $origin ) {
			if ( ! isset( $per_origin[ $origin ] ) || ! is_array( $per_origin[ $origin ] ) ) {
				continue;
			}
			$caps  = self::sanitize_string_list( $per_origin[ $origin ]['capabilities'] ?? array() );
			$roles = self::sanitize_string_list( $per_origin[ $origin ]['roles'] ?? array() );

			// Detect grow attempts → audit.
			$grew_caps = array_values( array_diff( $caps, $trusted_caps ) );
			foreach ( $grew_caps as $cap ) {
				self::$audit[] = array(
					'origin'    => $origin,
					'screen'    => $screen_id,
					'kind'      => 'capability',
					'attempted' => 'add',
					'detail'    => sprintf(
						/* translators: 1: origin name 2: capability slug */
						'origin "%1$s" attempted to add capability "%2$s" to permissions OR-set (consumer origins may only remove)',
						$origin,
						$cap
					),
				);
				if ( defined( 'WP_DEBUG' ) && WP_DEBUG ) {
					error_log( sprintf(
						'[wp-admin-shell] trust-tier violation: %s origin tried to add capability "%s" to screen "%s" OR-set; rejected.',
						$origin,
						$cap,
						$screen_id
					) );
				}
			}
			$grew_roles = array_values( array_diff( $roles, $trusted_roles ) );
			foreach ( $grew_roles as $role ) {
				self::$audit[] = array(
					'origin'    => $origin,
					'screen'    => $screen_id,
					'kind'      => 'role',
					'attempted' => 'add',
					'detail'    => sprintf(
						'origin "%1$s" attempted to add role "%2$s" to permissions OR-set (consumer origins may only remove)',
						$origin,
						$role
					),
				);
				if ( defined( 'WP_DEBUG' ) && WP_DEBUG ) {
					error_log( sprintf(
						'[wp-admin-shell] trust-tier violation: %s origin tried to add role "%s" to screen "%s" OR-set; rejected.',
						$origin,
						$role,
						$screen_id
					) );
				}
			}

			// Intersect the consumer's set with the trusted baseline —
			// this is the REMOVE-only application: anything not echoed by
			// the consumer (that lived in the baseline) gets dropped.
			$out_caps  = array_values( array_intersect( $out_caps, $caps ) );
			$out_roles = array_values( array_intersect( $out_roles, $roles ) );
		}

		return array(
			'capabilities' => array_values( array_unique( $out_caps ) ),
			'roles'        => array_values( array_unique( $out_roles ) ),
		);
	}

	/**
	 * Evaluate whether the given user passes the resolved permissions.
	 *
	 * Order:
	 *   1. AND-floor: user must hold EVERY cap in `appFloor`.
	 *   2. OR-set: user must hold ANY cap in `capabilities` OR belong to
	 *      ANY role in `roles`.
	 *
	 * Unknown caps and unknown roles fail closed — they cannot satisfy
	 * the OR-set even if the user is otherwise listed.
	 *
	 * @param int   $user_id        WP user id.
	 * @param array $resolved_perms Output of `resolve()`.
	 * @return bool
	 */
	public static function user_passes( $user_id, $resolved_perms ) {
		$user_id = (int) $user_id;
		if ( $user_id <= 0 ) {
			return false;
		}

		// AND-floor.
		$floor = isset( $resolved_perms['appFloor'] ) && is_array( $resolved_perms['appFloor'] )
			? $resolved_perms['appFloor']
			: array();
		foreach ( $floor as $cap ) {
			if ( ! self::is_known_capability( $cap ) ) {
				// App declared an unknown cap floor — fail closed.
				self::log_unknown( 'capability', $cap );
				return false;
			}
			if ( ! user_can( $user_id, $cap ) ) {
				return false;
			}
		}

		$caps  = isset( $resolved_perms['capabilities'] ) && is_array( $resolved_perms['capabilities'] )
			? $resolved_perms['capabilities']
			: array();
		$roles = isset( $resolved_perms['roles'] ) && is_array( $resolved_perms['roles'] )
			? $resolved_perms['roles']
			: array();

		// Empty OR-set (after app-floor passes) = floor was the only
		// gate. Allow through. Resolve() already inflates absent
		// permissions to admin-only, so this only triggers when the
		// caller explicitly passed `{ capabilities: [], roles: [] }`.
		if ( empty( $caps ) && empty( $roles ) ) {
			return true;
		}

		foreach ( $caps as $cap ) {
			if ( ! self::is_known_capability( $cap ) ) {
				self::log_unknown( 'capability', $cap );
				continue;
			}
			if ( user_can( $user_id, $cap ) ) {
				return true;
			}
		}

		$user_roles = self::user_role_list( $user_id );
		foreach ( $roles as $role ) {
			if ( $role === self::SUPER_ADMIN_ROLE ) {
				if ( is_super_admin( $user_id ) ) {
					return true;
				}
				continue;
			}
			if ( ! self::is_known_role( $role ) ) {
				self::log_unknown( 'role', $role );
				continue;
			}
			if ( in_array( $role, $user_roles, true ) ) {
				return true;
			}
		}

		return false;
	}

	/**
	 * Apply the super-admin magic to a role list — expanded for callers
	 * that need to evaluate the role list without `user_passes`'s full
	 * evaluation pipeline (e.g. boot-snapshot serialization).
	 *
	 * Returns the canonical list with `"super-admin"` left intact (the
	 * caller still resolves it at evaluation time); separately reports
	 * whether the user satisfies the magic membership.
	 *
	 * @param string[] $roles   Resolved roles list.
	 * @param int      $user_id WP user id.
	 * @return array { roles, hasSuperAdmin: bool, isSuperAdmin: bool }
	 */
	public static function apply_super_admin_magic( $roles, $user_id ) {
		$has_super_admin = in_array( self::SUPER_ADMIN_ROLE, (array) $roles, true );
		return array(
			'roles'         => array_values( (array) $roles ),
			'hasSuperAdmin' => $has_super_admin,
			'isSuperAdmin'  => $has_super_admin && is_super_admin( (int) $user_id ),
		);
	}

	/**
	 * Walk every screen in the resolved tree, applying trust-tier
	 * enforcement to its permissions and looking up the app floor for
	 * the screen's mounted app. Returns a flat map keyed by screen id
	 * for the boot-snapshot inline-script emission.
	 *
	 * The cascade merge engine already merged per-origin contributions
	 * into one screen.permissions by the time this runs. Trust-tier
	 * enforcement at the merge layer is handled by the merge engine's
	 * restrict-only invariants (see `WP_Admin_Shell_Merge`); this method
	 * applies the SCREEN-LEVEL pass: shrink unknown-slug entries (no
	 * log, the runtime checks at user_passes time), inflate empty
	 * permissions to default admin-only, and bind the app floor.
	 *
	 * @param array $resolved Merged admin.json doc.
	 * @return array [ screen_id => resolved_perms ]
	 */
	public static function resolve_screens( $resolved ) {
		self::reset_audit();
		$out = array();
		if ( ! is_array( $resolved ) || ! isset( $resolved['screens'] ) || ! is_array( $resolved['screens'] ) ) {
			return $out;
		}

		foreach ( $resolved['screens'] as $screen_id => $screen ) {
			if ( ! is_array( $screen ) ) {
				continue;
			}
			$perms     = $screen['permissions'] ?? null;
			$app_floor = self::app_floor_for( $screen );
			$out[ (string) $screen_id ] = self::resolve( $perms, $app_floor );
		}
		return $out;
	}

	/**
	 * Pull the app manifest's `capabilities[]` for the screen's mounted
	 * app. Returns an empty array when no app is declared, no manifest
	 * is registered, or the manifest declares no capabilities.
	 *
	 * Handles both shorthand (`screen.app`) and long form
	 * (`screen.apps[].app`) — the AND-floor is the UNION of every
	 * app's capabilities (every mounted app must be authorized).
	 *
	 * @param array $screen
	 * @return string[]
	 */
	public static function app_floor_for( $screen ) {
		if ( ! class_exists( 'WP_Admin_Shell_Manifest_Registry' ) ) {
			return array();
		}
		$registry = WP_Admin_Shell_Manifest_Registry::instance();
		$ids      = array();

		if ( isset( $screen['app'] ) && is_string( $screen['app'] ) ) {
			$ids[] = $screen['app'];
		}
		if ( isset( $screen['apps'] ) && is_array( $screen['apps'] ) ) {
			foreach ( $screen['apps'] as $entry ) {
				if ( is_array( $entry ) && isset( $entry['app'] ) && is_string( $entry['app'] ) ) {
					$ids[] = $entry['app'];
				}
			}
		}

		$floor = array();
		foreach ( $ids as $id ) {
			$manifest = $registry->get_app( $id );
			if ( ! is_array( $manifest ) ) {
				continue;
			}
			if ( isset( $manifest['capabilities'] ) && is_array( $manifest['capabilities'] ) ) {
				foreach ( $manifest['capabilities'] as $cap ) {
					if ( is_string( $cap ) && $cap !== '' ) {
						$floor[] = $cap;
					}
				}
			}
		}
		return array_values( array_unique( $floor ) );
	}

	/**
	 * Capability is "known" iff at least one registered role declares it
	 * OR it appears on the current user's per-user cap overlay. WP has
	 * no central capability registry — caps live on roles and on
	 * users (via grant_super_admin / Plugin overlays). The role-walk
	 * is sufficient for the unknown-value fail-closed contract: any
	 * cap a plugin registers via `add_cap()` lives on at least one
	 * role.
	 *
	 * @param string $cap
	 * @return bool
	 */
	public static function is_known_capability( $cap ) {
		if ( ! is_string( $cap ) || $cap === '' ) {
			return false;
		}
		$roles = wp_roles();
		if ( ! $roles ) {
			return false;
		}
		foreach ( $roles->role_objects as $role ) {
			if ( isset( $role->capabilities[ $cap ] ) ) {
				return true;
			}
		}
		// Per-user caps fallback — covers `grant_super_admin` and the
		// `add_cap()` user-overlay path (WP_User_Meta_Session_Tokens etc).
		// The check is best-effort against the current user's cap set;
		// resolver may not know the target user.
		$current = wp_get_current_user();
		if ( $current && isset( $current->allcaps[ $cap ] ) ) {
			return true;
		}
		return false;
	}

	/**
	 * Role is "known" iff `wp_roles()->is_role()` confirms it. The magic
	 * `super-admin` value is always known (it's not a registered role
	 * but the resolver treats it specially).
	 *
	 * @param string $role
	 * @return bool
	 */
	public static function is_known_role( $role ) {
		if ( ! is_string( $role ) || $role === '' ) {
			return false;
		}
		if ( $role === self::SUPER_ADMIN_ROLE ) {
			return true;
		}
		$roles = wp_roles();
		if ( ! $roles ) {
			return false;
		}
		return method_exists( $roles, 'is_role' )
			? $roles->is_role( $role )
			: isset( $roles->roles[ $role ] );
	}

	/**
	 * Return the current user's role membership list. Used for direct
	 * `$user->roles` evaluation in `user_passes`.
	 *
	 * @param int $user_id
	 * @return string[]
	 */
	public static function user_role_list( $user_id ) {
		$user = get_user_by( 'id', (int) $user_id );
		if ( ! $user || empty( $user->roles ) ) {
			return array();
		}
		return array_values( (array) $user->roles );
	}

	/**
	 * Return the current user's flat capabilities array — every cap they
	 * hold, including role-derived caps + per-user grants. Used by the
	 * inline-script handoff so the runtime can replicate `user_passes()`
	 * without a server round-trip.
	 *
	 * @param int $user_id
	 * @return string[]
	 */
	public static function user_capability_list( $user_id ) {
		$user = get_user_by( 'id', (int) $user_id );
		if ( ! $user || empty( $user->allcaps ) ) {
			return array();
		}
		$out = array();
		foreach ( $user->allcaps as $cap => $granted ) {
			if ( $granted && is_string( $cap ) && $cap !== '' ) {
				$out[] = $cap;
			}
		}
		return array_values( array_unique( $out ) );
	}

	// ── Internals ─────────────────────────────────────────────────────

	private static function sanitize_string_list( $value ) {
		if ( ! is_array( $value ) ) {
			return array();
		}
		$out = array();
		foreach ( $value as $entry ) {
			if ( is_string( $entry ) && $entry !== '' ) {
				$out[] = $entry;
			}
		}
		return $out;
	}

	private static function log_unknown( $kind, $slug ) {
		self::$audit[] = array(
			'origin'    => '',
			'screen'    => '',
			'kind'      => $kind,
			'attempted' => 'unknown',
			'detail'    => sprintf(
				'unknown %1$s "%2$s" — treated as permanently unsatisfiable (fail-closed).',
				$kind,
				$slug
			),
		);
		if ( defined( 'WP_DEBUG' ) && WP_DEBUG ) {
			error_log( sprintf(
				'[wp-admin-shell] unknown %s slug "%s" — fail-closed (no user can satisfy).',
				$kind,
				$slug
			) );
		}
	}
}
