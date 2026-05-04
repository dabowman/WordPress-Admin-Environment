import { useState } from '@wordpress/element';
import { useEntityRecord, useEntityRecords } from '@wordpress/core-data';
import {
	Button,
	InputControl,
	Stack,
	Text,
	Notice,
} from '@wordpress/ui';
import {
	SelectControl,
	RadioControl,
	CheckboxControl,
	Spinner,
	__experimentalDivider as Divider,
} from '@wordpress/components';
import { __ } from '@wordpress/i18n';

export default function SettingsReadingApp() {
	const { record, editedRecord, edit, save, hasEdits, isSaving } =
		useEntityRecord( 'root', 'site' );

	const pages = useEntityRecords( 'postType', 'page', {
		per_page: 100,
		status: 'publish',
		orderby: 'title',
		order: 'asc',
		_fields: 'id,title',
		context: 'edit',
	} );

	const [ notice, setNotice ] = useState( null );

	if ( ! record ) {
		return (
			<div className="wp-admin-shell-app-settings-reading__loading">
				<Spinner />
			</div>
		);
	}

	const handleSave = async () => {
		try {
			await save();
			setNotice( {
				intent: 'success',
				message: __( 'Settings saved.', 'wp-admin-shell' ),
			} );
		} catch ( err ) {
			setNotice( {
				intent: 'error',
				message:
					err.message ||
					__( 'Failed to save settings.', 'wp-admin-shell' ),
			} );
		}
	};

	const eventValue = ( e ) => e.target.value;

	const pageOptions = [
		{ value: '0', label: __( '— Select —', 'wp-admin-shell' ) },
		...( pages.records || [] ).map( ( p ) => ( {
			value: String( p.id ),
			label: p.title?.rendered || p.title?.raw || `#${ p.id }`,
		} ) ),
	];

	const showOnFront = editedRecord.show_on_front || 'posts';

	return (
		<div className="wp-admin-shell-app-settings-reading">
			<Stack direction="column" gap="xl">
				<Text variant="heading-xl" render={ <h2 /> }>
					{ __( 'Reading', 'wp-admin-shell' ) }
				</Text>

				{ notice && (
					<Notice.Root intent={ notice.intent }>
						<Notice.Description>
							{ notice.message }
						</Notice.Description>
						<Notice.Actions>
							<Notice.CloseIcon
								onClick={ () => setNotice( null ) }
							/>
						</Notice.Actions>
					</Notice.Root>
				) }

				<RadioControl
					label={ __( 'Your homepage displays', 'wp-admin-shell' ) }
					selected={ showOnFront }
					options={ [
						{
							value: 'posts',
							label: __(
								'Your latest posts',
								'wp-admin-shell'
							),
						},
						{
							value: 'page',
							label: __(
								'A static page',
								'wp-admin-shell'
							),
						},
					] }
					onChange={ ( val ) => edit( { show_on_front: val } ) }
				/>

				{ showOnFront === 'page' && (
					<Stack direction="column" gap="md">
						<SelectControl
							label={ __( 'Homepage', 'wp-admin-shell' ) }
							value={ String( editedRecord.page_on_front ?? 0 ) }
							options={ pageOptions }
							onChange={ ( val ) =>
								edit( { page_on_front: parseInt( val, 10 ) } )
							}
							__nextHasNoMarginBottom
						/>
						<SelectControl
							label={ __( 'Posts page', 'wp-admin-shell' ) }
							value={ String( editedRecord.page_for_posts ?? 0 ) }
							options={ pageOptions }
							onChange={ ( val ) =>
								edit( { page_for_posts: parseInt( val, 10 ) } )
							}
							__nextHasNoMarginBottom
						/>
					</Stack>
				) }

				<Divider />

				<InputControl
					label={ __(
						'Blog pages show at most',
						'wp-admin-shell'
					) }
					type="number"
					value={ String( editedRecord.posts_per_page ?? 10 ) }
					onChange={ ( e ) =>
						edit( {
							posts_per_page:
								parseInt( eventValue( e ), 10 ) || 10,
						} )
					}
				/>

				<InputControl
					label={ __(
						'Syndication feeds show the most recent',
						'wp-admin-shell'
					) }
					type="number"
					value={ String( editedRecord.posts_per_rss ?? 10 ) }
					onChange={ ( e ) =>
						edit( {
							posts_per_rss:
								parseInt( eventValue( e ), 10 ) || 10,
						} )
					}
				/>

				<RadioControl
					label={ __( 'For each post in a feed, include', 'wp-admin-shell' ) }
					selected={ editedRecord.rss_use_excerpt ? '1' : '0' }
					options={ [
						{
							value: '0',
							label: __( 'Full text', 'wp-admin-shell' ),
						},
						{
							value: '1',
							label: __( 'Excerpt', 'wp-admin-shell' ),
						},
					] }
					onChange={ ( val ) =>
						edit( { rss_use_excerpt: val === '1' } )
					}
				/>

				<Divider />

				<CheckboxControl
					label={ __(
						'Allow people to submit comments on new posts',
						'wp-admin-shell'
					) }
					checked={ editedRecord.default_comment_status === 'open' }
					onChange={ ( v ) =>
						edit( {
							default_comment_status: v ? 'open' : 'closed',
						} )
					}
					__nextHasNoMarginBottom
				/>
				<CheckboxControl
					label={ __(
						'Allow link notifications from other blogs (pingbacks and trackbacks) on new posts',
						'wp-admin-shell'
					) }
					checked={ editedRecord.default_ping_status === 'open' }
					onChange={ ( v ) =>
						edit( { default_ping_status: v ? 'open' : 'closed' } )
					}
					__nextHasNoMarginBottom
				/>

				<Text variant="body-sm">
					{ __(
						'Search-engine visibility (the “discourage search engines” toggle) is not exposed by the REST API. Use the legacy Reading Settings screen for that field.',
						'wp-admin-shell'
					) }
				</Text>

				<Stack direction="row" justify="flex-start">
					<Button
						tone="brand"
						variant="solid"
						onClick={ handleSave }
						disabled={ ! hasEdits || isSaving }
						loading={ isSaving }
					>
						{ __( 'Save Changes', 'wp-admin-shell' ) }
					</Button>
				</Stack>
			</Stack>
		</div>
	);
}
