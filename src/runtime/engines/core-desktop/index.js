import Layout from './Layout';
import { compileStyles } from './compileStyles.mjs';
import { iconTable, fallbackIcon } from './icons';
import { registerIcons } from '../../config/iconMap';
import './index.css';

registerIcons( iconTable, { fallback: fallbackIcon } );

/**
 * @type {import('../../registry/source-types.js').EngineSource}
 *
 * Phase status:
 *   - P2.T1: scaffolding (engine.json templates, Layout, icon table).
 *   - P2.T2: WindowManager + Window frame + dock; drag, 8-handle resize,
 *     snap-to-edge; live-window dock tiles for minimize restore.
 *   - P2.T5: `compileStyles` hook maps admin.json
 *     `styles.chrome.*` slot overrides into CSS variables scoped to the
 *     kernel's ThemeProvider wrapper. `engine.json#default-styles`
 *     carries the desktop palette so consuming shells inherit. No
 *     `ThemeProvider` field — kernel renders this engine inside a
 *     neutral pass-through wrapper. Bundled apps inside windows still
 *     consume `--wpds-*` tokens; those resolve via the apps' own
 *     `@wordpress/ui` / `@wordpress/components` imports without an
 *     engine-level WPDS provider. A WPDS-flavored desktop variant
 *     (true WPDS-to-WPD aesthetic bridge) defers to a follow-up.
 *   - P2.T3 ports the dock-rail registry.
 *   - P2.T4 wires the chromeless iframe bridge.
 */
const coreDesktop = {
	kind: 'engine',
	id: 'core:desktop',
	title: 'Desktop',
	Component: Layout,
	compileStyles,
	iconTable,
};

export default coreDesktop;
