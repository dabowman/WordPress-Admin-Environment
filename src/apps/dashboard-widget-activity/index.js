/**
 * core:dashboard-widget-activity — bundled default dashboard tile.
 *
 * Decomposed from the retired `core:dashboard` monolith (issue #133),
 * mirroring wp-admin's "Activity" box: recently published posts +
 * comments awaiting moderation. Both lists are **site-wide** (the
 * Activity box reports everyone's activity, matching wp-admin); only
 * Recent Drafts is author-scoped per the #133 design note.
 */

import { useMemo } from '@wordpress/element';
import { useEntityRecords } from '@wordpress/core-data';
import { Button, Stack, Text } from '@wordpress/ui';
import { Spinner } from '@wordpress/components';
import { __ } from '@wordpress/i18n';

import { navigate } from '../../runtime/routing/router';
import { useKernel } from '../../runtime/kernel-context';
import { editTargetHref } from '../_shared/navigation/editorHref.mjs';

function stripTags( html ) {
	return html.replace( /<[^>]*>/g, '' ).trim();
}

export default function DashboardWidgetActivityApp() {
	// Editor-link target (Tier 1 handoff): the workspace editor route when
	// the active workspace declares one, classic `post.php` otherwise.
	const { config: runtimeConfig } = useKernel();
	const routes = runtimeConfig?.routes;
	const publishedQuery = useMemo(
		() => ( {
			per_page: 5,
			status: 'publish',
			context: 'edit',
			orderby: 'date',
			order: 'desc',
		} ),
		[]
	);
	const pendingCommentsQuery = useMemo(
		() => ( { per_page: 5, status: 'hold', context: 'edit' } ),
		[]
	);

	const posts = useEntityRecords( 'postType', 'post', publishedQuery );
	const comments = useEntityRecords(
		'root',
		'comment',
		pendingCommentsQuery
	);

	return (
		<Stack direction="column" gap="xl">
			<Stack direction="column" gap="sm">
				<Text variant="heading-sm" render={ <h3 /> }>
					{ __( 'Recently published', 'wp-admin-workspaces' ) }
				</Text>
				{ ( () => {
					if ( posts.isResolving && ! posts.records ) {
						return <Spinner />;
					}
					if ( ! posts.records?.length ) {
						return (
							<Text variant="body-sm">
								{ __(
									'Nothing published yet.',
									'wp-admin-workspaces'
								) }
							</Text>
						);
					}
					return posts.records.map( ( post ) => (
						<Stack
							key={ post.id }
							direction="row"
							justify="space-between"
							align="center"
						>
							<Button
								tone="neutral"
								variant="minimal"
								render={
									<a
										href={ editTargetHref(
											'post',
											post.id,
											routes
										) }
									/>
								}
							>
								{ post.title?.raw ||
									post.title?.rendered ||
									__( '(no title)', 'wp-admin-workspaces' ) }
							</Button>
							<Text variant="body-sm">
								{ new Date( post.date ).toLocaleDateString() }
							</Text>
						</Stack>
					) );
				} )() }
			</Stack>

			<Stack direction="column" gap="sm">
				<Text variant="heading-sm" render={ <h3 /> }>
					{ __(
						'Comments awaiting moderation',
						'wp-admin-workspaces'
					) }
				</Text>
				{ ( () => {
					if ( comments.isResolving && ! comments.records ) {
						return <Spinner />;
					}
					if ( ! comments.records?.length ) {
						return (
							<Text variant="body-sm">
								{ __(
									'Inbox zero. Nothing pending.',
									'wp-admin-workspaces'
								) }
							</Text>
						);
					}
					return (
						<>
							{ comments.records.map( ( c ) => (
								<Stack key={ c.id } direction="column" gap="xs">
									<Text variant="body-sm">
										<strong>{ c.author_name }</strong>
									</Text>
									<Text variant="body-sm" render={ <span /> }>
										{ stripTags(
											c.content?.rendered || ''
										).slice( 0, 120 ) }
									</Text>
								</Stack>
							) ) }
							<Stack direction="row" justify="flex-start">
								<Button
									tone="neutral"
									variant="outline"
									size="small"
									onClick={ () => navigate( '#/comments' ) }
								>
									{ __(
										'Moderate all',
										'wp-admin-workspaces'
									) }
								</Button>
							</Stack>
						</>
					);
				} )() }
			</Stack>
		</Stack>
	);
}
