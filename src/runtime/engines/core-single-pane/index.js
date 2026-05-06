import Layout from './Layout';
import { WpdsThemeProvider } from '../../styles/WpdsThemeProvider';
import './index.css';

/** @type {import('../../registry/source-types.js').EngineSource} */
const coreSinglePane = {
	kind: 'engine',
	id: 'core:single-pane',
	title: 'Single pane',
	Component: Layout,
	ThemeProvider: WpdsThemeProvider,
};

export default coreSinglePane;
