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
import { recentDraftsQuery } from '../dashboard-widget-recent-posts/query.mjs';

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
			let draft = null;
			try {
				draft = await saveEntityRecord( 'postType', 'post', {
					title,
					content:
						content ||
						'<!-- wp:paragraph --><p></p><!-- /wp:paragraph -->',
					status: 'draft',
				} );
				// Refresh the recent-drafts widget's query. The shape
				// must match the Recent Drafts widget's query exactly
				// (author-scoped to the same acting user) — otherwise
				// the sibling tile keeps stale data.
				invalidateResolution( 'getEntityRecords', [
					'postType',
					'post',
					recentDraftsQuery( window.wpAdminWorkspaces?.userId ),
				] );
			} catch ( err ) {
				setError(
					err?.message || __( 'Save failed', 'wp-admin-workspaces' )
				);
				setSaving( false );
				return;
			}
			if ( draft?.id ) {
				// Navigate FIRST, then skip the post-navigate state
				// resets — `navigate()` triggers a hashchange that
				// unmounts this component, so any setState after this
				// point fires on an unmounted node. The success path
				// returns without touching local state.
				navigate( `#/posts/${ draft.id }/edit` );
				return;
			}
			// No draft id (defensive) — reset form + spinner in place.
			setTitle( '' );
			setContent( '' );
			setSaving( false );
		},
		[ title, content, isSaving, saveEntityRecord, invalidateResolution ]
	);

	return (
		<form onSubmit={ onSubmit }>
			<Stack direction="column" gap="sm">
				<input
					type="text"
					value={ title }
					placeholder={ __( 'Title', 'wp-admin-workspaces' ) }
					onChange={ ( e ) => setTitle( e.target.value ) }
					className="wp-admin-workspaces-dashboard-quick-draft__title"
					aria-label={ __( 'Draft title', 'wp-admin-workspaces' ) }
				/>
				<TextareaControl
					value={ content }
					rows={ 3 }
					placeholder={ __(
						"What's on your mind?",
						'wp-admin-workspaces'
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
						{ __( 'Save Draft', 'wp-admin-workspaces' ) }
					</Button>
				</Stack>
			</Stack>
		</form>
	);
}
