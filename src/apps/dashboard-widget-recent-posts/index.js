/**
 * core:dashboard-widget-recent-posts — bundled default dashboard tile.
 *
 * Ports `core:dashboard`'s recent-drafts list into a standalone widget
 * app (issue #133 — the monolith was folded into the host + default
 * tiles). Reads `postType/post` filtered by `status: draft`,
 * orderby modified desc, **author-scoped to the acting user** (issue
 * #217: an unscoped drafts query leaks every author's unpublished
 * content). Renders the first five as click-to-edit links.
 *
 * Fail-closed: the query is only issued when the acting-user id is
 * known (`enabled: !!userId`). Without it the request is skipped and
 * the empty state renders — drafts never leak across authors.
 */

import { useMemo } from '@wordpress/element';
import { useEntityRecords } from '@wordpress/core-data';
import { Button, Stack, Text } from '@wordpress/ui';
import { Spinner } from '@wordpress/components';
import { __ } from '@wordpress/i18n';

import { navigate } from '../../runtime/routing/router';
import { recentDraftsQuery } from './query.mjs';

export default function DashboardWidgetRecentPostsApp() {
	const userId = window.wpAdminShell?.userId;
	const query = useMemo( () => recentDraftsQuery( userId ), [ userId ] );
	const drafts = useEntityRecords( 'postType', 'post', query, {
		enabled: !! userId,
	} );

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
