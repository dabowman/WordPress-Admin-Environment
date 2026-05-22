import Layout from './Layout';
import { WpdsThemeProvider } from './WpdsThemeProvider';
import { compileStyles } from './compileStyles.mjs';
import { iconTable, fallbackIcon } from './icons';
import { registerIcons } from '../../config/iconMap';
import './index.css';

registerIcons( iconTable, { fallback: fallbackIcon } );

/** @type {import('../../registry/source-types.js').EngineSource} */
const coreDefault = {
	kind: 'engine',
	id: 'core:default',
	title: 'Default',
	Component: Layout,
	ThemeProvider: WpdsThemeProvider,
	compileStyles,
	iconTable,
};

export default coreDefault;
