import Layout from './Layout';
import './index.css';

/** @type {import('../../registry/source-types.js').EngineSource} */
const coreDefault = {
	kind: 'engine',
	id: 'core:default',
	title: 'Default',
	Component: Layout,
};

export default coreDefault;
