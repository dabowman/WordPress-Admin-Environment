import Layout from './Layout';
// `core:single-pane` reuses the `core:default` WPDS contract.
// It points at core-default's `WpdsThemeProvider`, `compileStyles`,
// and `iconTable` so single-pane stays a thin layout variant on the
// same DS surface. A standalone non-WPDS pane engine would ship its
// own provider + compiler + icon table.
import { WpdsThemeProvider } from '../core-default/WpdsThemeProvider';
import { compileStyles } from '../core-default/compileStyles.mjs';
import { iconTable, fallbackIcon } from '../core-default/icons';
import { registerIcons } from '../../config/iconMap';
import { registerMenuRenderer } from '../../config/menuRendererRegistry';
import DrawerRenderer from './DrawerRenderer';
import './index.css';

registerIcons( iconTable, { fallback: fallbackIcon } );

// Engine-owned menu renderer. `core:single-pane` declares
// `"menu-renderer": "drawer"` in its manifest; `core:navigation` resolves
// that id here. Registered from the engine module (not the bundled nav
// app) so it travels with the engine if it's extracted to a plugin.
registerMenuRenderer( 'drawer', DrawerRenderer );

/** @type {import('../../registry/source-types.js').EngineSource} */
const coreSinglePane = {
	kind: 'engine',
	id: 'core:single-pane',
	title: 'Single pane',
	Component: Layout,
	ThemeProvider: WpdsThemeProvider,
	compileStyles,
	iconTable,
};

export default coreSinglePane;
