import { useMemo, useState } from '@wordpress/element';
import { useEntityRecords } from '@wordpress/core-data';
import { useDispatch } from '@wordpress/data';
import { store as coreStore } from '@wordpress/core-data';
import { store as noticesStore } from '@wordpress/notices';
import { DataViews } from '@wordpress/dataviews/wp';
import { Button, Stack, Text } from '@wordpress/ui';
import { Button as DestructiveButton } from '@wordpress/components';
import { __ } from '@wordpress/i18n';
import { trash } from '@wordpress/icons';

/**
 * core:comments — moderation list backed by `useEntityRecords('root','comment')`.
 *
 * Status flow: hold → approved | spam | trash. The REST endpoint accepts
 * `status` updates via PATCH; we issue them through saveEntityRecord with
 * a partial payload so optimistic edits round-trip cleanly. Comment
 * content arrives HTML-rendered; we lean on dangerouslySetInnerHTML
 * because @wordpress/components' Text doesn't pass HTML through.
 */
const STATUS_LABELS = {
	approved: __( 'Approved',  'wp-admin-shell' ),
	hold:     __( 'Pending',   'wp-admin-shell' ),
	spam:     __( 'Spam',      'wp-admin-shell' ),
	trash:    __( 'Trash',     'wp-admin-shell' ),
};

export default function CommentsApp() {
	const [ view, setView ] = useState( {
		type: 'table',
		search: '',
		filters: [],
		page: 1,
		perPage: 20,
		sort: { field: 'date', direction: 'desc' },
		fields: [ 'author', 'content', 'status', 'date' ],
		layout: {},
	} );

	const queryArgs = useMemo( () => {
		const args = {
			per_page: view.perPage,
			page: view.page,
			order: view.sort?.direction || 'desc',
			orderby: view.sort?.field || 'date_gmt',
			context: 'edit',
			status: 'any',
		};
		if ( view.search ) {
			args.search = view.search;
		}
		for ( const filter of view.filters ) {
			if ( filter.field === 'status' && filter.operator === 'is' ) {
				args.status = filter.value;
			}
		}
		return args;
	}, [ view ] );

	const { records, isResolving, totalItems, totalPages } = useEntityRecords(
		'root',
		'comment',
		queryArgs
	);

	const { saveEntityRecord, deleteEntityRecord, invalidateResolution } =
		useDispatch( coreStore );
	const { createSuccessNotice, createErrorNotice } = useDispatch( noticesStore );

	const data = useMemo( () => {
		if ( ! records ) {
			return [];
		}
		return records.map( ( record ) => ( {
			id: record.id,
			author: record.author_name || '',
			authorEmail: record.author_email || '',
			content: record.content?.rendered || '',
			status: record.status,
			date: record.date,
			rawRecord: record,
		} ) );
	}, [ records ] );

	const fields = useMemo(
		() => [
			{
				id: 'author',
				type: 'text',
				label: __( 'Author', 'wp-admin-shell' ),
				enableGlobalSearch: true,
				render: ( { item } ) => (
					<Stack direction="column" gap="xs">
						<Text className="wp-admin-shell-app-comments__name">
							{ item.author }
						</Text>
						<Text
							variant="body-sm"
							className="wp-admin-shell-app-comments__muted"
						>
							{ item.authorEmail }
						</Text>
					</Stack>
				),
			},
			{
				id: 'content',
				type: 'text',
				label: __( 'Comment', 'wp-admin-shell' ),
				enableGlobalSearch: true,
				// Trust boundary: `item.content` comes from
				// `record.content.rendered`, which WordPress core filters
				// server-side via `wp_filter_comment_content` (kses + the
				// comment-text filter chain). Author-supplied raw HTML
				// has already been sanitized before it reaches the REST
				// response. Rendering as HTML preserves the formatted
				// view comment moderators expect.
				render: ( { item } ) => (
					<div
						className="wp-admin-shell-app-comments__excerpt"
						dangerouslySetInnerHTML={ { __html: item.content } }
					/>
				),
			},
			{
				id: 'status',
				type: 'text',
				label: __( 'Status', 'wp-admin-shell' ),
				elements: Object.entries( STATUS_LABELS ).map(
					( [ value, label ] ) => ( { value, label } )
				),
				render: ( { item } ) => (
					<Text>{ STATUS_LABELS[ item.status ] || item.status }</Text>
				),
				filterBy: { operators: [ 'isAny' ] },
			},
			{
				id: 'date',
				type: 'datetime',
				label: __( 'Date', 'wp-admin-shell' ),
			},
		],
		[]
	);


	const setCommentsStatus = async ( items, targetStatus, label ) => {
		try {
			await Promise.all(
				items.map( ( item ) =>
					saveEntityRecord( 'root', 'comment', {
						id: item.id,
						status: targetStatus,
					} )
				)
			);
			invalidateResolution( 'getEntityRecords', [
				'root',
				'comment',
				queryArgs,
			] );
			createSuccessNotice( label, { type: 'snackbar' } );
		} catch ( err ) {
			createErrorNotice(
				err?.message || __( 'Action failed.', 'wp-admin-shell' ),
				{ isDismissible: true }
			);
		}
	};

	const actions = useMemo(
		() => [
			{
				id: 'approve',
				label: __( 'Approve', 'wp-admin-shell' ),
				supportsBulk: true,
				isEligible: ( item ) => item.status !== 'approved',
				callback: ( items ) =>
					setCommentsStatus( items, 'approved', __( 'Approved.', 'wp-admin-shell' ) ),
			},
			{
				id: 'unapprove',
				label: __( 'Unapprove', 'wp-admin-shell' ),
				supportsBulk: true,
				isEligible: ( item ) => item.status === 'approved',
				callback: ( items ) =>
					setCommentsStatus( items, 'hold', __( 'Set to pending.', 'wp-admin-shell' ) ),
			},
			{
				id: 'spam',
				label: __( 'Mark as spam', 'wp-admin-shell' ),
				isDestructive: true,
				supportsBulk: true,
				isEligible: ( item ) => item.status !== 'spam',
				callback: ( items ) =>
					setCommentsStatus( items, 'spam', __( 'Marked as spam.', 'wp-admin-shell' ) ),
			},
			{
				id: 'trash',
				label: __( 'Move to trash', 'wp-admin-shell' ),
				isDestructive: true,
				supportsBulk: true,
				icon: trash,
				isEligible: ( item ) => item.status !== 'trash',
				RenderModal: ( { items, closeModal, onActionPerformed } ) => (
					<Stack
						direction="column"
						gap="lg"
						style={ { padding: '16px' } }
					>
						<Text>
							{ items.length === 1
								? __( 'Move this comment to trash?', 'wp-admin-shell' )
								: __( 'Move these comments to trash?', 'wp-admin-shell' ) }
						</Text>
						<Stack direction="row" justify="flex-end" gap="sm">
							<Button
								tone="neutral"
								variant="minimal"
								onClick={ closeModal }
							>
								{ __( 'Cancel', 'wp-admin-shell' ) }
							</Button>
							<DestructiveButton
								variant="primary"
								isDestructive
								onClick={ async () => {
									try {
										await Promise.all(
											items.map( ( item ) =>
												deleteEntityRecord( 'root', 'comment', item.id )
											)
										);
										invalidateResolution(
											'getEntityRecords',
											[ 'root', 'comment', queryArgs ]
										);
										createSuccessNotice(
											__( 'Moved to trash.', 'wp-admin-shell' ),
											{ type: 'snackbar' }
										);
										onActionPerformed?.( items );
									} catch ( err ) {
										createErrorNotice(
											err?.message || __( 'Failed to trash.', 'wp-admin-shell' ),
											{ isDismissible: true }
										);
									}
									closeModal();
								} }
							>
								{ __( 'Trash', 'wp-admin-shell' ) }
							</DestructiveButton>
						</Stack>
					</Stack>
				),
			},
			
		],
		[
			saveEntityRecord,
			deleteEntityRecord,
			invalidateResolution,
			queryArgs,
			createSuccessNotice,
			createErrorNotice,
		]
	);

	const paginationInfo = useMemo(
		() => ( {
			totalItems: totalItems || 0,
			totalPages: totalPages || 0,
		} ),
		[ totalItems, totalPages ]
	);

	const [ selection, setSelection ] = useState( [] );

	return (
		<div className="wp-admin-shell-app-comments">
			<DataViews
				data={ data }
				fields={ fields }
				view={ view }
				onChangeView={ setView }
				actions={ actions }
				paginationInfo={ paginationInfo }
				isLoading={ isResolving }
				defaultLayouts={ { table: {}, grid: {} } }
				selection={ selection }
				onChangeSelection={ setSelection }
				getItemId={ ( item ) => item.id.toString() }
			/>
		</div>
	);
}
