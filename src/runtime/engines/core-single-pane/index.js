import Layout from './Layout';
import { WpdsThemeProvider } from '../core-default/WpdsThemeProvider';
import { compileStyles } from '../core-default/compileStyles.mjs';
import { iconTable, fallbackIcon } from '../core-default/icons';
import { registerIcons } from '../../config/iconMap';
import './index.css';

registerIcons( iconTable, { fallback: fallbackIcon } );

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
