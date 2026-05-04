import { useMemo } from '@wordpress/element';
import { useEntityRecords, useEntityRecord } from '@wordpress/core-data';
import {
	Button,
	Card,
	Stack,
	Text,
} from '@wordpress/ui';
import {
	__experimentalGrid as Grid,
	Spinner,
} from '@wordpress/components';
import { __, sprintf } from '@wordpress/i18n';
import { navigate } from '../runtime/routing/router';

function StatCard( { label, value, isLoading } ) {
	return (
		<Card.Root>
			<Card.Content>
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
			</Card.Content>
		</Card.Root>
	);
}

export default function DashboardApp() {
	const userId = window.wpAdminShell?.userId;
	// useEntityRecord is null-safe when given a falsy id — it short-circuits
	// without attempting a request. Always-call so the hook order is stable.
	const { record: user } = useEntityRecord( 'root', 'user', userId || 0 );

	const postsQuery = useMemo(
		() => ( { per_page: 1, status: 'publish', context: 'edit', _fields: 'id' } ),
		[]
	);
	const draftQuery = useMemo(
		() => ( {
			per_page: 5,
			status: 'draft',
			context: 'edit',
			orderby: 'modified',
			order: 'desc',
		} ),
		[]
	);
	const pendingComments = useMemo(
		() => ( { per_page: 5, status: 'hold', context: 'edit' } ),
		[]
	);
	const recentMedia = useMemo(
		() => ( { per_page: 1, _fields: 'id' } ),
		[]
	);
	const pagesQuery = useMemo(
		() => ( { per_page: 1, status: 'publish', context: 'edit', _fields: 'id' } ),
		[]
	);
	const usersQuery = useMemo( () => ( { per_page: 1, _fields: 'id' } ), [] );

	const posts = useEntityRecords( 'postType', 'post', postsQuery );
	const drafts = useEntityRecords( 'postType', 'post', draftQuery );
	const pages = useEntityRecords( 'postType', 'page', pagesQuery );
	const comments = useEntityRecords( 'root', 'comment', pendingComments );
	const media = useEntityRecords( 'root', 'media', recentMedia );
	const users = useEntityRecords( 'root', 'user', usersQuery );

	const greeting = useMemo( () => {
		const hour = new Date().getHours();
		if ( hour < 12 ) {
			return __( 'Good morning', 'wp-admin-shell' );
		}
		if ( hour < 18 ) {
			return __( 'Good afternoon', 'wp-admin-shell' );
		}
		return __( 'Good evening', 'wp-admin-shell' );
	}, [] );

	const displayName = user?.name || user?.first_name || '';

	return (
		<div className="wp-admin-shell-app-dashboard">
			<Stack direction="column" gap="xl">
				<Stack direction="column" gap="xs">
					<Text variant="heading-xl" render={ <h1 /> }>
						{ displayName
							? sprintf(
									/* translators: 1: greeting, 2: user display name */
									__( '%1$s, %2$s', 'wp-admin-shell' ),
									greeting,
									displayName
							  )
							: greeting }
					</Text>
					<Text variant="body-md">
						{ __(
							'Here is a snapshot of your site.',
							'wp-admin-shell'
						) }
					</Text>
				</Stack>

				<Stack direction="row" gap="sm" wrap="wrap">
					<Button
						tone="brand"
						variant="solid"
						onClick={ () => navigate( 'editor', 'post', 'new' ) }
					>
						{ __( 'Write a post', 'wp-admin-shell' ) }
					</Button>
					<Button
						tone="neutral"
						variant="outline"
						onClick={ () => navigate( 'editor', 'page', 'new' ) }
					>
						{ __( 'Add a page', 'wp-admin-shell' ) }
					</Button>
					<Button
						tone="neutral"
						variant="outline"
						onClick={ () => navigate( 'media' ) }
					>
						{ __( 'Upload media', 'wp-admin-shell' ) }
					</Button>
				</Stack>

				<Grid columns={ 4 } gap={ 4 }>
					<StatCard
						label={ __( 'Published posts', 'wp-admin-shell' ) }
						value={ posts.totalItems }
						isLoading={ posts.isResolving }
					/>
					<StatCard
						label={ __( 'Published pages', 'wp-admin-shell' ) }
						value={ pages.totalItems }
						isLoading={ pages.isResolving }
					/>
					<StatCard
						label={ __( 'Pending comments', 'wp-admin-shell' ) }
						value={ comments.totalItems }
						isLoading={ comments.isResolving }
					/>
					<StatCard
						label={ __( 'Users', 'wp-admin-shell' ) }
						value={ users.totalItems }
						isLoading={ users.isResolving }
					/>
				</Grid>

				<Grid columns={ 2 } gap={ 4 }>
					<Card.Root>
						<Card.Header>
							<Card.Title>
								<Text variant="heading-md" render={ <h2 /> }>
									{ __( 'Recent drafts', 'wp-admin-shell' ) }
								</Text>
							</Card.Title>
						</Card.Header>
						<Card.Content>
							{ drafts.isResolving && ! drafts.records ? (
								<Spinner />
							) : drafts.records?.length ? (
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
													navigate(
														'editor',
														'post',
														draft.id
													)
												}
											>
												{ draft.title?.raw ||
													draft.title?.rendered ||
													__(
														'(no title)',
														'wp-admin-shell'
													) }
											</Button>
											<Text variant="body-sm">
												{ new Date(
													draft.modified
												).toLocaleDateString() }
											</Text>
										</Stack>
									) ) }
								</Stack>
							) : (
								<Text variant="body-sm">
									{ __(
										'No drafts yet. Start writing!',
										'wp-admin-shell'
									) }
								</Text>
							) }
						</Card.Content>
					</Card.Root>

					<Card.Root>
						<Card.Header>
							<Card.Title>
								<Text variant="heading-md" render={ <h2 /> }>
									{ __(
										'Comments awaiting moderation',
										'wp-admin-shell'
									) }
								</Text>
							</Card.Title>
						</Card.Header>
						<Card.Content>
							{ comments.isResolving && ! comments.records ? (
								<Spinner />
							) : comments.records?.length ? (
								<Stack direction="column" gap="sm">
									{ comments.records.map( ( c ) => (
										<Stack
											key={ c.id }
											direction="column"
											gap="xs"
										>
											<Text variant="body-sm">
												<strong>
													{ c.author_name }
												</strong>
											</Text>
											<Text
												variant="body-sm"
												render={ <span /> }
											>
												{ stripTags(
													c.content?.rendered || ''
												).slice( 0, 120 ) }
											</Text>
										</Stack>
									) ) }
									<Button
										tone="neutral"
										variant="outline"
										size="small"
										onClick={ () =>
											navigate( 'comments' )
										}
									>
										{ __(
											'Moderate all',
											'wp-admin-shell'
										) }
									</Button>
								</Stack>
							) : (
								<Text variant="body-sm">
									{ __(
										'Inbox zero. Nothing pending.',
										'wp-admin-shell'
									) }
								</Text>
							) }
						</Card.Content>
					</Card.Root>
				</Grid>
			</Stack>
		</div>
	);
}

function stripTags( html ) {
	return html.replace( /<[^>]*>/g, '' ).trim();
}
