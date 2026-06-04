/* eslint-disable @wordpress/no-unsafe-wp-apis -- __experimentalItemGroup/Item have no @wordpress/ui 0.12 ports. */
import './index.css';
import { useState, useMemo } from '@wordpress/element';
import {
	__experimentalItemGroup as ItemGroup,
	__experimentalItem as Item,
} from '@wordpress/components';
import { Stack } from '@wordpress/ui';
import { __ } from '@wordpress/i18n';
import SettingsGeneralApp from '../settings-general';
import SettingsWritingApp from '../settings-writing';
import SettingsReadingApp from '../settings-reading';
import SettingsDiscussionApp from '../settings-discussion';
import SettingsMediaApp from '../settings-media';
import IframeApp from '../iframe-fallback';

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
 *   reading     — partial: front-page config, posts-per-page, RSS
 *   discussion  — partial: default comment + ping status (the canonical
 *                  home for these "Default post settings" — Reading used
 *                  to duplicate them; removed)
 *   permalinks  — iframed (no REST coverage; needs custom endpoint)
 *   media       — native: image-size dimensions, thumbnail crop, year/month
 *                  uploads folder (exposed via the plugin's register_setting
 *                  shims — issue #117)
 *   privacy     — iframed (privacy page not REST-exposed)
 *
 * Workspaces narrow the panel set via `config.panels[]` (allowlist by id).
 * Plugin-registered panels are not currently supported — the slot/fill
 * extension was retired in V2.M4 in favor of programmatic engine /
 * workspace registration; v2.x may re-introduce a panel registry once the
 * surface stabilizes.
 */

const BUILTIN_PANELS = [
	{
		id: 'general',
		label: __( 'General', 'wp-admin-workspaces' ),
		Component: SettingsGeneralApp,
		capability: 'manage_options',
	},
	{
		id: 'writing',
		label: __( 'Writing', 'wp-admin-workspaces' ),
		Component: SettingsWritingApp,
		capability: 'manage_options',
	},
	{
		id: 'reading',
		label: __( 'Reading', 'wp-admin-workspaces' ),
		Component: SettingsReadingApp,
		capability: 'manage_options',
	},
	{
		id: 'discussion',
		label: __( 'Discussion', 'wp-admin-workspaces' ),
		Component: SettingsDiscussionApp,
		capability: 'manage_options',
	},
	{
		id: 'permalinks',
		label: __( 'Permalinks', 'wp-admin-workspaces' ),
		iframe: 'options-permalink.php',
		capability: 'manage_options',
	},
	{
		id: 'media',
		label: __( 'Media', 'wp-admin-workspaces' ),
		Component: SettingsMediaApp,
		capability: 'manage_options',
	},
	{
		id: 'privacy',
		label: __( 'Privacy', 'wp-admin-workspaces' ),
		iframe: 'options-privacy.php',
		capability: 'manage_options',
	},
];

export default function SettingsApp( { app, config = {}, segments = [] } ) {
	const panels = useMemo( () => {
		const allowedIds = config.panels;
		const passesAllowlist = ( panel ) =>
			! Array.isArray( allowedIds ) ||
			allowedIds.length === 0 ||
			allowedIds.includes( panel.id );
		return BUILTIN_PANELS.filter( passesAllowlist );
	}, [ config.panels ] );

	const initialPanelId = segments[ 0 ] || panels[ 0 ]?.id;
	const [ activeId, setActive ] = useState( initialPanelId );

	// Unknown sub-route (e.g. `#/settings/nonexistent`) silently falls
	// back to the first available panel rather than 404-ing. Acceptable
	// v1 behavior — the panel list is shallow and the user lands on
	// something sensible. v2 may surface a "panel not found" notice.
	const activePanel =
		panels.find( ( p ) => p.id === activeId ) || panels[ 0 ];

	if ( ! activePanel ) {
		return (
			<div className="wp-admin-workspaces-content__empty">
				{ __(
					'No settings panels are available.',
					'wp-admin-workspaces'
				) }
			</div>
		);
	}

	const PanelComponent = activePanel.Component;
	const iframeUrl = activePanel.iframe;

	return (
		<div className="wp-admin-workspaces-app-settings">
			<Stack
				direction="row"
				align="flex-start"
				gap="xs"
				style={ { height: '100%' } }
			>
				<div className="wp-admin-workspaces-app-settings__nav">
					<ItemGroup isBordered={ false } isSeparated={ false }>
						{ panels.map( ( panel ) => (
							<Item
								key={ panel.id }
								onClick={ () => setActive( panel.id ) }
								isSelected={ panel.id === activePanel.id }
								className={
									panel.id === activePanel.id
										? 'is-selected'
										: ''
								}
							>
								{ panel.label }
							</Item>
						) ) }
					</ItemGroup>
				</div>
				<div className="wp-admin-workspaces-app-settings__panel">
					{ ( () => {
						if ( PanelComponent ) {
							return (
								<PanelComponent
									app={ app }
									config={ activePanel.config || {} }
								/>
							);
						}
						if ( iframeUrl ) {
							return (
								<IframeApp
									app={ app }
									config={ { url: iframeUrl } }
								/>
							);
						}
						return null;
					} )() }
				</div>
			</Stack>
		</div>
	);
}
