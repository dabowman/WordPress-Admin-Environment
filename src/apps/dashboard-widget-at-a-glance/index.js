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
	const publishedQuery = useMemo(
		() => ( {
			per_page: 1,
			status: 'publish',
			context: 'edit',
			_fields: 'id',
		} ),
		[]
	);
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
				isLoading={ posts.isResolving }
			/>
			<Stat
				label={ __( 'Published pages', 'wp-admin-shell' ) }
				value={ pages.totalItems }
				isLoading={ pages.isResolving }
			/>
			<Stat
				label={ __( 'Pending comments', 'wp-admin-shell' ) }
				value={ comments.totalItems }
				isLoading={ comments.isResolving }
			/>
			<Stat
				label={ __( 'Users', 'wp-admin-shell' ) }
				value={ users.totalItems }
				isLoading={ users.isResolving }
			/>
		</Stack>
	);
}
