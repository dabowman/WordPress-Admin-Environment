import { useState, useMemo } from '@wordpress/element';
import {
	__experimentalItemGroup as ItemGroup,
	__experimentalItem as Item,
	__experimentalHStack as HStack,
} from '@wordpress/components';
import { __ } from '@wordpress/i18n';
import { useSlotItems } from '../runtime/slots/dataSlots';

import SettingsGeneralApp from './SettingsGeneralApp';
import SettingsWritingApp from './settings-panels/SettingsWritingApp';
import SettingsReadingApp from './settings-panels/SettingsReadingApp';
import SettingsDiscussionApp from './settings-panels/SettingsDiscussionApp';
import IframeApp from './IframeApp';

/**
 * core:settings — composable settings host.
 *
 * Each settings panel is either:
 *   - native (Component receives no extra props beyond what the host renders),
 *   - iframed (description carries `iframe: '<url>'` and the host mounts
 *     IframeApp configured to that wp-admin URL).
 *
 * Built-in panels reflect the REST coverage matrix in
 * docs/admin-json-api-validation.md §core:settings:
 *
 *   general     — full coverage, native (existing SettingsGeneralApp)
 *   writing     — partial: default category + post format
 *   reading     — partial: front-page config, posts-per-page, RSS,
 *                  default comment + ping status
 *   discussion  — partial: default comment + ping status
 *   permalinks  — iframed (no REST coverage; needs custom endpoint)
 *   media       — iframed (image-size + uploads-org-by-month not REST-exposed)
 *   privacy     — iframed (privacy page not REST-exposed)
 *
 * Plugin panels register via the core:settings.panels data slot.
 */

const BUILTIN_PANELS = [
	{
		id: 'general',
		label: __( 'General', 'wp-admin-shell' ),
		Component: SettingsGeneralApp,
		capability: 'manage_options',
	},
	{
		id: 'writing',
		label: __( 'Writing', 'wp-admin-shell' ),
		Component: SettingsWritingApp,
		capability: 'manage_options',
	},
	{
		id: 'reading',
		label: __( 'Reading', 'wp-admin-shell' ),
		Component: SettingsReadingApp,
		capability: 'manage_options',
	},
	{
		id: 'discussion',
		label: __( 'Discussion', 'wp-admin-shell' ),
		Component: SettingsDiscussionApp,
		capability: 'manage_options',
	},
	{
		id: 'permalinks',
		label: __( 'Permalinks', 'wp-admin-shell' ),
		iframe: 'options-permalink.php',
		capability: 'manage_options',
	},
	{
		id: 'media',
		label: __( 'Media', 'wp-admin-shell' ),
		iframe: 'options-media.php',
		capability: 'manage_options',
	},
	{
		id: 'privacy',
		label: __( 'Privacy', 'wp-admin-shell' ),
		iframe: 'options-privacy.php',
		capability: 'manage_options',
	},
];

export default function SettingsApp( { app, config = {}, segments = [] } ) {
	const slotPanels = useSlotItems( 'core:settings.panels' );

	const panels = useMemo( () => {
		const allowedIds = config.panels;
		const passesAllowlist = ( panel ) =>
			! Array.isArray( allowedIds ) ||
			allowedIds.length === 0 ||
			allowedIds.includes( panel.id );

		// Builtins keep authority over their ids — a plugin registering
		// `core:settings.panels` with `id: 'general'` does NOT shadow the
		// builtin General panel. Document this at the slot contract.
		const builtinIds = new Set( BUILTIN_PANELS.map( ( p ) => p.id ) );

		const seen = new Set();
		const out = [];

		for ( const panel of BUILTIN_PANELS ) {
			if ( ! passesAllowlist( panel ) ) {
				continue;
			}
			out.push( panel );
			seen.add( panel.id );
		}

		// Plugin panels: must have a unique id, must pass the shell's
		// allowlist if one is set. Last-write-wins between plugin panels
		// with duplicate ids — same convention as registerSlotItem.
		for ( const panel of slotPanels ) {
			if ( ! panel || typeof panel !== 'object' || ! panel.id ) {
				continue;
			}
			if ( builtinIds.has( panel.id ) ) {
				continue;
			}
			if ( ! passesAllowlist( panel ) ) {
				continue;
			}
			if ( seen.has( panel.id ) ) {
				const existingIndex = out.findIndex( ( p ) => p.id === panel.id );
				if ( existingIndex >= 0 ) {
					out[ existingIndex ] = panel;
				}
				continue;
			}
			out.push( panel );
			seen.add( panel.id );
		}

		return out;
	}, [ config.panels, slotPanels ] );

	const initialPanelId = segments[ 0 ] || panels[ 0 ]?.id;
	const [ activeId, setActive ] = useState( initialPanelId );

	// Unknown sub-route (e.g. `#/settings/nonexistent`) silently falls
	// back to the first available panel rather than 404-ing. Acceptable
	// v1 behavior — the panel list is shallow and the user lands on
	// something sensible. v2 may surface a "panel not found" notice.
	const activePanel = panels.find( ( p ) => p.id === activeId ) || panels[ 0 ];

	if ( ! activePanel ) {
		return (
			<div className="wp-admin-shell-content__empty">
				{ __( 'No settings panels are available.', 'wp-admin-shell' ) }
			</div>
		);
	}

	const PanelComponent = activePanel.Component;
	const iframeUrl = activePanel.iframe;

	return (
		<div className="wp-admin-shell-app-settings">
			<HStack alignment="flex-start" spacing={ 0 } style={ { height: '100%' } }>
				<aside className="wp-admin-shell-app-settings__nav">
					<ItemGroup isBordered={ false } isSeparated={ false }>
						{ panels.map( ( panel ) => (
							<Item
								key={ panel.id }
								onClick={ () => setActive( panel.id ) }
								isSelected={ panel.id === activePanel.id }
								className={ panel.id === activePanel.id ? 'is-selected' : '' }
							>
								{ panel.label }
							</Item>
						) ) }
					</ItemGroup>
				</aside>
				<section className="wp-admin-shell-app-settings__panel">
					{ PanelComponent ? (
						<PanelComponent app={ app } config={ activePanel.config || {} } />
					) : iframeUrl ? (
						<IframeApp app={ { source: `iframe:${ iframeUrl }` } } config={ {} } />
					) : null }
				</section>
			</HStack>
		</div>
	);
}
