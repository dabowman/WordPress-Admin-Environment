import { createRoot } from '@wordpress/element';
import Shell from './shell/Shell';
import './index.css';

const container = document.getElementById( 'wp-admin-shell' );
if ( container ) {
	const root = createRoot( container );
	root.render( <Shell /> );
}
