import { createRoot } from '@wordpress/element';
import { kernel } from './runtime/kernel';
import { registerMenuRenderer } from './runtime/config/menuRendererRegistry';
import './index.css';

// Published kernel surface for loose plugin scripts. A third-party menu
// renderer shipped as a standalone script (no bundler access to the
// kernel modules) registers its component through this global. Built-in
// + engine-owned renderers register via a direct ESM import instead and
// don't need it. Assigned before mount so a renderer script that ran
// before this module can't be lost — though scripts enqueued after the
// bundle still race the synchronous mount below (see the
// kernel-import-surface gap in docs/feedback.md).
if ( window.wpAdminShell ) {
	window.wpAdminShell.registerMenuRenderer = registerMenuRenderer;
}

const container = document.getElementById( 'wp-admin-shell' );
if ( container ) {
	const root = createRoot( container );
	root.render( kernel( window.wpAdminShell?.config ) );
}
