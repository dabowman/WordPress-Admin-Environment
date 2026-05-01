import { useMemo, useState } from '@wordpress/element';
import { useEntityRecords } from '@wordpress/core-data';
import { useDispatch } from '@wordpress/data';
import { store as coreStore } from '@wordpress/core-data';
import { DataViews } from '@wordpress/dataviews';
import {
	Button,
	__experimentalText as Text,
	__experimentalHStack as HStack,
	__experimentalVStack as VStack,
} from '@wordpress/components';
import { __ } from '@wordpress/i18n';
import { check, closeSmall, trash, external } from '@wordpress/icons';

const STATUS_LABELS = {
	approved: __( 'Approved', 'wp-admin-shell' ),
	hold: __( 'Pending', 'wp-admin-shell' ),
	spam: __( 'Spam', 'wp-admin-shell' ),
	trash: __( 'Trash', 'wp-admin-shell' ),
};

const STATUS_OPTIONS = Object.entries( STATUS_LABELS ).map(
	( [ value, label ] ) => ( { value, label } )
);

function stripTags( html ) {
	return ( html || '' ).replace( /<[^>]*>/g, '' ).trim();
}

export default function CommentsApp( { config = {} } ) {
	const [ view, setView ] = useState( {
		type: 'table',
		search: '',
		filters:
			config.status && config.status !== 'all'
				? [
						{
							field: 'status',
							operator: 'is',
							value: config.status,
						},
				  ]
				: [],
		page: 1,
		perPage: 20,
		sort: { field: 'date', direction: 'desc' },
		fields: [ 'author', 'content', 'status', 'post', 'date' ],
		layout: {},
	} );

	const queryArgs = useMemo( () => {
		const args = {
			per_page: view.perPage,
			page: view.page,
			order: view.sort?.direction || 'desc',
			orderby: view.sort?.field || 'date',
			context: 'edit',
			status: 'all',
		};
		if ( view.search ) {
			args.search = view.search;
		}
		for ( const filter of view.filters ) {
			if ( filter.field === 'status' ) {
				if ( filter.operator === 'isAny' && Array.isArray( filter.value ) ) {
					args.status = filter.value.join( ',' );
				} else if ( filter.operator === 'is' ) {
					args.status = filter.value;
				}
			}
		}
		return args;
	}, [ view ] );

	const { records, isResolving, totalItems, totalPages } = useEntityRecords(
		'root',
		'comment',
		queryArgs
	);

	const { saveEntityRecord, deleteEntityRecord } = useDispatch( coreStore );

	const data = useMemo( () => {
		if ( ! records ) {
			return [];
		}
		return records.map( ( c ) => ( {
			id: c.id,
			author: c.author_name || __( '(unknown)', 'wp-admin-shell' ),
			authorEmail: c.author_email || '',
			authorUrl: c.author_url || '',
			content: stripTags( c.content?.rendered || '' ),
			status: c.status,
			post: c.post,
			date: c.date,
			link: c.link,
			rawRecord: c,
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
					<VStack spacing={ 1 }>
						<Text weight={ 600 }>{ item.author }</Text>
						{ item.authorEmail && (
							<Text variant="muted" size={ 12 }>
								{ item.authorEmail }
							</Text>
						) }
					</VStack>
				),
			},
			{
				id: 'content',
				type: 'text',
				label: __( 'Comment', 'wp-admin-shell' ),
				enableGlobalSearch: true,
				render: ( { item } ) => (
					<Text>
						{ item.content.length > 200
							? `${ item.content.slice( 0, 200 ) }…`
							: item.content }
					</Text>
				),
			},
			{
				id: 'status',
				type: 'text',
				label: __( 'Status', 'wp-admin-shell' ),
				elements: STATUS_OPTIONS,
				render: ( { item } ) => (
					<Text>{ STATUS_LABELS[ item.status ] || item.status }</Text>
				),
				filterBy: { operators: [ 'is', 'isAny' ] },
			},
			{
				id: 'post',
				type: 'integer',
				label: __( 'In response to', 'wp-admin-shell' ),
				render: ( { item } ) =>
					item.post ? <Text>#{ item.post }</Text> : null,
			},
			{
				id: 'date',
				type: 'datetime',
				label: __( 'Submitted on', 'wp-admin-shell' ),
			},
		],
		[]
	);

	const setStatus = async ( items, status ) => {
		await Promise.all(
			items.map( ( item ) =>
				saveEntityRecord( 'root', 'comment', {
					id: item.id,
					status,
				} )
			)
		);
	};

	const actions = useMemo(
		() => [
			{
				id: 'approve',
				label: __( 'Approve', 'wp-admin-shell' ),
				icon: check,
				isPrimary: true,
				supportsBulk: true,
				isEligible: ( item ) => item.status !== 'approved',
				callback: ( items ) => setStatus( items, 'approved' ),
			},
			{
				id: 'unapprove',
				label: __( 'Unapprove', 'wp-admin-shell' ),
				icon: closeSmall,
				supportsBulk: true,
				isEligible: ( item ) => item.status === 'approved',
				callback: ( items ) => setStatus( items, 'hold' ),
			},
			{
				id: 'spam',
				label: __( 'Mark as spam', 'wp-admin-shell' ),
				supportsBulk: true,
				isEligible: ( item ) => item.status !== 'spam',
				callback: ( items ) => setStatus( items, 'spam' ),
			},
			{
				id: 'view',
				label: __( 'View', 'wp-admin-shell' ),
				icon: external,
				isEligible: ( item ) => !! item.link,
				callback: ( items ) =>
					window.open( items[ 0 ].link, '_blank' ),
			},
			{
				id: 'trash',
				label: __( 'Move to Trash', 'wp-admin-shell' ),
				icon: trash,
				isDestructive: true,
				supportsBulk: true,
				isEligible: ( item ) => item.status !== 'trash',
				RenderModal: ( { items, closeModal, onActionPerformed } ) => (
					<VStack spacing={ 4 } style={ { padding: '16px' } }>
						<Text>
							{ items.length === 1
								? __(
										'Move this comment to the trash?',
										'wp-admin-shell'
								  )
								: __(
										'Move these comments to the trash?',
										'wp-admin-shell'
								  ) }
						</Text>
						<HStack justify="right">
							<Button variant="tertiary" onClick={ closeModal }>
								{ __( 'Cancel', 'wp-admin-shell' ) }
							</Button>
							<Button
								variant="primary"
								isDestructive
								onClick={ async () => {
									await Promise.all(
										items.map( ( item ) =>
											deleteEntityRecord(
												'root',
												'comment',
												item.id
											)
										)
									);
									onActionPerformed?.( items );
									closeModal();
								} }
							>
								{ __( 'Move to Trash', 'wp-admin-shell' ) }
							</Button>
						</HStack>
					</VStack>
				),
			},
			{
				id: 'delete-permanently',
				label: __( 'Delete permanently', 'wp-admin-shell' ),
				icon: trash,
				isDestructive: true,
				supportsBulk: true,
				isEligible: ( item ) => item.status === 'trash',
				RenderModal: ( { items, closeModal, onActionPerformed } ) => (
					<VStack spacing={ 4 } style={ { padding: '16px' } }>
						<Text>
							{ __(
								'This cannot be undone. Continue?',
								'wp-admin-shell'
							) }
						</Text>
						<HStack justify="right">
							<Button variant="tertiary" onClick={ closeModal }>
								{ __( 'Cancel', 'wp-admin-shell' ) }
							</Button>
							<Button
								variant="primary"
								isDestructive
								onClick={ async () => {
									await Promise.all(
										items.map( ( item ) =>
											deleteEntityRecord(
												'root',
												'comment',
												item.id,
												{ force: true }
											)
										)
									);
									onActionPerformed?.( items );
									closeModal();
								} }
							>
								{ __( 'Delete forever', 'wp-admin-shell' ) }
							</Button>
						</HStack>
					</VStack>
				),
			},
		],
		[ deleteEntityRecord, saveEntityRecord ]
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
				defaultLayouts={ { table: {} } }
				selection={ selection }
				onChangeSelection={ setSelection }
				getItemId={ ( item ) => item.id.toString() }
			/>
		</div>
	);
}
