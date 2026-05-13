import Layout from './Layout';
import { iconTable, fallbackIcon } from './icons';
import { registerIcons } from '../../config/iconMap';
import './index.css';

registerIcons( iconTable, { fallback: fallbackIcon } );

/**
 * @type {import('../../registry/source-types.js').EngineSource}
 *
 * Phase notes:
 *   - P2.T1 (this commit): scaffolding only. ThemeProvider + compileStyles
 *     are not declared; the kernel's `ThemeProviderHost` falls back to the
 *     WPDS-backed default. P2.T5 will add `WpdThemeProvider` + the engine's
 *     `compileStyles` that maps admin.json chrome slots to `--wpd-*` vars
 *     plus the WPDS-to-WPD primitives bridge for default apps mounted
 *     inside window frames.
 *   - P2.T2 will fill `core:desktop-compositor` with the WindowManager
 *     state class; `core:desktop-window-frame` with React frame chrome.
 *   - P2.T3 will fill `core:desktop-dock-app` with the ported dock rail
 *     renderer driving the compositor via `WindowManagerContext`.
 *   - P2.T4 wires the chromeless bridge for legacy admin pages mounted in
 *     `core:desktop-iframe` windows.
 */
const coreDesktop = {
	kind: 'engine',
	id: 'core:desktop',
	title: 'Desktop',
	Component: Layout,
	iconTable,
};

export default coreDesktop;
