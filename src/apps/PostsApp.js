import { __experimentalHeading as Heading } from '@wordpress/components';

export default function PostsApp( { config } ) {
	return (
		<div className="wp-admin-shell-app-posts">
			<Heading level={ 2 }>
				{ config.postType === 'page' ? 'Pages' : 'Posts' }
			</Heading>
			<p>DataViews list coming in Step 2.</p>
		</div>
	);
}
