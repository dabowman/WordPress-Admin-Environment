import { createRoot } from '@wordpress/element';
import { kernel } from './runtime/kernel';
import './index.css';

const container = document.getElementById( 'wp-admin-shell' );
if ( container ) {
	const root = createRoot( container );
	root.render( kernel( window.wpAdminShell?.config ) );
}
