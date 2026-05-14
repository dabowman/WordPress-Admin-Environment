/**
 * core:dashboard-widget-recent-posts — bundled C4 widget.
 *
 * Ports `core:dashboard`'s recent-drafts list into a standalone widget
 * app eligible for the dashboard grid. Reads `postType/post` filtered
 * by `status: draft`, orderby modified desc, renders the first five
 * as clickable links to the editor.
 */

import { useMemo } from '@wordpress/element';
import { useEntityRecords } from '@wordpress/core-data';
import { Button, Stack, Text } from '@wordpress/ui';
import { Spinner } from '@wordpress/components';
import { __ } from '@wordpress/i18n';

import { navigate } from '../../runtime/routing/router';

export default function DashboardWidgetRecentPostsApp() {
	const query = useMemo(
		() => ( {
			per_page: 5,
			status: 'draft',
			context: 'edit',
			orderby: 'modified',
			order: 'desc',
		} ),
		[]
	);
	const drafts = useEntityRecords( 'postType', 'post', query );

	if ( drafts.isResolving && ! drafts.records ) {
		return <Spinner />;
	}
	if ( ! drafts.records?.length ) {
		return (
			<Text variant="body-sm">
				{ __( 'No drafts yet. Start writing!', 'wp-admin-shell' ) }
			</Text>
		);
	}

	return (
		<Stack direction="column" gap="sm">
			{ drafts.records.map( ( draft ) => (
				<Stack
					key={ draft.id }
					direction="row"
					justify="space-between"
					align="center"
				>
					<Button
						tone="neutral"
						variant="minimal"
						onClick={ () =>
							navigate( `#/posts/${ draft.id }/edit` )
						}
					>
						{ draft.title?.raw ||
							draft.title?.rendered ||
							__( '(no title)', 'wp-admin-shell' ) }
					</Button>
					<Text variant="body-sm">
						{ new Date( draft.modified ).toLocaleDateString() }
					</Text>
				</Stack>
			) ) }
		</Stack>
	);
}
