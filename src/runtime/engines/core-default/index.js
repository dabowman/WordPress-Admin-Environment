import Layout from './Layout';
import { WpdsThemeProvider } from '../../styles/WpdsThemeProvider';
import { compileStyles } from './compileStyles.mjs';
import './index.css';

/** @type {import('../../registry/source-types.js').EngineSource} */
const coreDefault = {
	kind: 'engine',
	id: 'core:default',
	title: 'Default',
	Component: Layout,
	ThemeProvider: WpdsThemeProvider,
	compileStyles,
};

export default coreDefault;
