import { __experimentalHeading as Heading } from '@wordpress/components';

export default function IframeApp( { app } ) {
	const url = app.source.replace( 'iframe:', '' );
	return (
		<div className="wp-admin-shell-app-iframe">
			<Heading level={ 2 }>{ app.title }</Heading>
			<p>Iframe for <code>{ url }</code> coming in Step 3.</p>
		</div>
	);
}
