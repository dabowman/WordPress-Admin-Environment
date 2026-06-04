import { Icon } from '@wordpress/ui';

import { resolveIcon } from '../../../runtime/config/iconMap';

/**
 * Arbitrary-icon escape hatch (engine/app-space; issues #127 + #128).
 *
 * The kernel icon registry (`resolveIcon`) is NAME-based and DS-neutral —
 * it can only resolve icon *names* the active engine registered. The
 * classic-menu bridge, however, harvests icons wp-admin plugins ship as
 * data-URI SVGs or image URLs (`add_menu_page( …, $icon_url )`), and the
 * admin-bar bridge harvests node titles that are arbitrary admin HTML.
 * Those can't go through the name registry.
 *
 * This component is the single pass-through render path both consumers
 * share. It is DELIBERATELY app/engine-space (it imports `@wordpress/ui`)
 * — the kernel must stay name-based + DS-neutral, so it never learns about
 * `iconSource`. See `docs/runtime-harvest-pattern.md` → "Arbitrary-icon
 * escape hatch".
 *
 * Resolution order:
 *   1. `iconSource` descriptor (the escape hatch) wins when present:
 *        - { type: 'url', value }      → <img src=value> (data-URI / URL)
 *        - { type: 'dashicon', value } → <span class="dashicons dashicons-value">
 *   2. otherwise fall back to the name registry via `resolveIcon( name )`.
 *
 * Trust: a harvested `url` value is admin-context — the same trust level
 * at which classic wp-admin renders the very same `$icon_url`. No new
 * exposure (the workspace only renders it inside the already-admin-gated
 * workspace).
 *
 * @param {Object}      root0
 * @param {Object|null} root0.iconSource Escape-hatch descriptor `{ type, value }`.
 * @param {string}      [root0.name]     Registry icon name (fallback).
 * @param {number}      [root0.size]     Pixel size (default 24).
 * @param {string}      [root0.alt]      Alt text for the `<img>` form.
 * @return {*} React element or null.
 */
export default function ArbitraryIcon( {
	iconSource,
	name,
	size = 24,
	alt = '',
} ) {
	if ( iconSource && typeof iconSource === 'object' ) {
		const { type, value } = iconSource;
		if ( type === 'url' && typeof value === 'string' && value !== '' ) {
			return (
				<img
					className="wp-admin-workspaces-arbitrary-icon"
					src={ value }
					alt={ alt }
					width={ size }
					height={ size }
					style={ {
						width: size,
						height: size,
						objectFit: 'contain',
					} }
				/>
			);
		}
		if (
			type === 'dashicon' &&
			typeof value === 'string' &&
			value !== ''
		) {
			return (
				<span
					className={ `dashicons dashicons-${ value } wp-admin-workspaces-arbitrary-icon` }
					aria-hidden="true"
					style={ { fontSize: size, width: size, height: size } }
				/>
			);
		}
	}

	if ( ! name ) {
		return null;
	}
	return (
		<Icon
			style={ { fill: 'currentcolor' } }
			icon={ resolveIcon( name ) }
			size={ size }
		/>
	);
}

/**
 * Render trusted, admin-context HTML inline (admin-bar node titles —
 * issue #128). Harvested admin-bar node `title` strings are arbitrary
 * HTML/icon markup the emitting plugin already rendered at admin trust in
 * classic wp-admin; we render it unchanged inside the admin-gated
 * workspace. App-space, never the kernel.
 *
 * Trust awareness: this is the same author-trust boundary as classic, but
 * NOT a byte-identical threat surface — an event-handler attribute injected
 * into a node title executes in the workspace SPA's document context (`wp.data`,
 * REST nonces, the kernel runtime on `window`), not just the classic
 * admin-bar render. Accepted risk (a plugin that can inject here is already
 * admin-trusted); see `docs/runtime-harvest-pattern.md` → "Trust".
 *
 * @param {Object} root0
 * @param {string} root0.html Trusted admin-context HTML.
 * @return {*} React element or null.
 */
export function TrustedNodeTitle( { html } ) {
	if ( typeof html !== 'string' || html === '' ) {
		return null;
	}
	return (
		<span
			className="wp-admin-workspaces-arbitrary-node-title"
			// eslint-disable-next-line react/no-danger -- admin-context node title; same trust as classic wp-admin (see runtime-harvest-pattern.md).
			dangerouslySetInnerHTML={ { __html: html } }
		/>
	);
}
