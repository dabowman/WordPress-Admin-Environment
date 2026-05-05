import Layout from './Layout';

/** @type {import('../../registry/source-types.js').EngineSource} */
const coreSinglePaneLayout = {
	kind: 'engine',
	id: 'core:single-pane-layout',
	title: 'Single-pane layout',
	Component: Layout,
};

export default coreSinglePaneLayout;
