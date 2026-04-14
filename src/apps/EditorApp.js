import { __experimentalHeading as Heading } from '@wordpress/components';

export default function EditorApp( { params } ) {
	return (
		<div className="wp-admin-shell-app-editor">
			<Heading level={ 2 }>Editor</Heading>
			<p>Editor iframe coming in Step 4.</p>
			{ params.length > 0 && (
				<p>
					Route: { params.join( '/' ) }
				</p>
			) }
		</div>
	);
}
