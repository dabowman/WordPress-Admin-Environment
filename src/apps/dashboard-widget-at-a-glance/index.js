/**
 * core:dashboard-widget-at-a-glance — bundled default dashboard tile.
 *
 * Decomposed from the retired `core:dashboard` monolith (issue #133).
 * Renders site-wide counts — published posts, published pages, pending
 * comments, registered users. Counts are intentionally **site-wide**
 * (aggregate), NOT author-scoped: At-a-Glance mirrors wp-admin's "At a
 * Glance" box, which reports the whole site (per the #133 design note,
 * only Recent Drafts is author-scoped; the counts stay site-wide).
 *
 * Counts come from each query's `totalItems` (the `X-WP-Total` header),
 * so `per_page: 1` + `_fields: id` keeps the payload minimal.
 */

import { useMemo } from '@wordpress/element';
import { useEntityRecords } from '@wordpress/core-data';
import { Stack, Text } from '@wordpress/ui';
import { Spinner } from '@wordpress/components';
import { __ } from '@wordpress/i18n';

function Stat( { label, value, isLoading } ) {
	return (
		<Stack direction="column" gap="xs">
			<Text variant="body-sm">{ label }</Text>
			{ isLoading ? (
				<Spinner />
			) : (
				<Text variant="heading-xl" render={ <span /> }>
					{ value ?? '—' }
				</Text>
			) }
		</Stack>
	);
}

export default function DashboardWidgetAtAGlanceApp() {
	// Count-only queries: `totalItems` reads the `X-WP-Total` header, returned
	// in default `view` context, so no `context: 'edit'` — that would raise the
	// permission floor (this tile's cap floor is `read`) and 403 published
	// posts/pages counts for read-only users. Published content is publicly
	// countable in `view` context.
	const publishedQuery = useMemo(
		() => ( {
			per_page: 1,
			status: 'publish',
			_fields: 'id',
		} ),
		[]
	);
	// Pending comments inherently need `moderate_comments` — keep
	// `context: 'edit'`; read-only users correctly see `—` here.
	const pendingCommentsQuery = useMemo(
		() => ( {
			per_page: 1,
			status: 'hold',
			context: 'edit',
			_fields: 'id',
		} ),
		[]
	);
	const usersQuery = useMemo( () => ( { per_page: 1, _fields: 'id' } ), [] );

	const posts = useEntityRecords( 'postType', 'post', publishedQuery );
	const pages = useEntityRecords( 'postType', 'page', publishedQuery );
	const comments = useEntityRecords(
		'root',
		'comment',
		pendingCommentsQuery
	);
	const users = useEntityRecords( 'root', 'user', usersQuery );

	return (
		<Stack direction="row" gap="xl" wrap="wrap">
			<Stat
				label={ __( 'Published posts', 'wp-admin-shell' ) }
				value={ posts.totalItems }
				isLoading={
					posts.isResolving && posts.totalItems === undefined
				}
			/>
			<Stat
				label={ __( 'Published pages', 'wp-admin-shell' ) }
				value={ pages.totalItems }
				isLoading={
					pages.isResolving && pages.totalItems === undefined
				}
			/>
			<Stat
				label={ __( 'Pending comments', 'wp-admin-shell' ) }
				value={ comments.totalItems }
				isLoading={
					comments.isResolving && comments.totalItems === undefined
				}
			/>
			<Stat
				label={ __( 'Users', 'wp-admin-shell' ) }
				value={ users.totalItems }
				isLoading={
					users.isResolving && users.totalItems === undefined
				}
			/>
		</Stack>
	);
}
