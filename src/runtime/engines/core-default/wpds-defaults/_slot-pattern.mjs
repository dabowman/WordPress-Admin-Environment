/**
 * Shared regex for parsing `--wpds-{slug}: {value};` declarations from
 * the upstream `@wordpress/theme/src/prebuilt/css/design-tokens.css`.
 *
 * Used by:
 *   - scripts/snapshot-wpds.mjs       (regenerates 6.9.json)
 *   - tests/parity/wpds-snapshot.test.mjs (CI parity check)
 *
 * Kept here so the two callers share one source of truth — drift
 * between snapshotter and parity test would silently let added/renamed
 * upstream slots slip through.
 *
 * Each call site MUST re-instantiate the RegExp (regex objects with
 * the `g` flag carry mutable lastIndex state). Export the source
 * string + flags rather than a singleton.
 */

export const WPDS_SLOT_PATTERN_SOURCE = '(--wpds-[a-z0-9-]+)\\s*:\\s*([^;]+?)\\s*;';
export const WPDS_SLOT_PATTERN_FLAGS  = 'gi';

export function wpdsSlotPattern() {
	return new RegExp( WPDS_SLOT_PATTERN_SOURCE, WPDS_SLOT_PATTERN_FLAGS );
}
