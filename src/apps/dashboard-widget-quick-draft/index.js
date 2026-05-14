/**
 * core:dashboard-widget-quick-draft — bundled C4 widget.
 *
 * Substack-style mini form: title input + textarea, Save Draft button.
 * On submit, POSTs a new `postType/post` with status: draft and
 * navigates to the editor for the new post.
 */

import { useState, useCallback } from '@wordpress/element';
import { useDispatch } from '@wordpress/data';
import { store as coreStore } from '@wordpress/core-data';
import { Button, Stack, Text } from '@wordpress/ui';
import { TextareaControl } from '@wordpress/components';
import { __ } from '@wordpress/i18n';

import { navigate } from '../../runtime/routing/router';

import './index.css';

export default function DashboardWidgetQuickDraftApp() {
	const [ title, setTitle ] = useState( '' );
	const [ content, setContent ] = useState( '' );
	const [ isSaving, setSaving ] = useState( false );
	const [ error, setError ] = useState( null );
	const { saveEntityRecord, invalidateResolution } = useDispatch( coreStore );

	const onSubmit = useCallback(
		async ( e ) => {
			e.preventDefault();
			if ( isSaving ) {
				return;
			}
			setSaving( true );
			setError( null );
			try {
				const draft = await saveEntityRecord( 'postType', 'post', {
					title,
					content:
						content ||
						'<!-- wp:paragraph --><p></p><!-- /wp:paragraph -->',
					status: 'draft',
				} );
				// Refresh the recent-drafts widget's query.
				invalidateResolution( 'getEntityRecords', [
					'postType',
					'post',
					{
						per_page: 5,
						status: 'draft',
						context: 'edit',
						orderby: 'modified',
						order: 'desc',
					},
				] );
				if ( draft?.id ) {
					navigate( `#/posts/${ draft.id }/edit` );
				}
				setTitle( '' );
				setContent( '' );
			} catch ( err ) {
				setError(
					err?.message || __( 'Save failed', 'wp-admin-shell' )
				);
			} finally {
				setSaving( false );
			}
		},
		[ title, content, isSaving, saveEntityRecord, invalidateResolution ]
	);

	return (
		<form onSubmit={ onSubmit }>
			<Stack direction="column" gap="sm">
				<input
					type="text"
					value={ title }
					placeholder={ __( 'Title', 'wp-admin-shell' ) }
					onChange={ ( e ) => setTitle( e.target.value ) }
					className="wp-admin-shell-dashboard-quick-draft__title"
					aria-label={ __( 'Draft title', 'wp-admin-shell' ) }
				/>
				<TextareaControl
					value={ content }
					rows={ 3 }
					placeholder={ __(
						"What's on your mind?",
						'wp-admin-shell'
					) }
					onChange={ ( value ) => setContent( value ) }
					__nextHasNoMarginBottom
				/>
				{ error ? <Text variant="body-sm">{ error }</Text> : null }
				<Stack direction="row" justify="flex-end" gap="sm">
					<Button
						type="submit"
						tone="brand"
						variant="solid"
						loading={ isSaving }
						disabled={ isSaving || ! title }
					>
						{ __( 'Save Draft', 'wp-admin-shell' ) }
					</Button>
				</Stack>
			</Stack>
		</form>
	);
}
