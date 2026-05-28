import './index.css';
import { useState, useEffect, useCallback } from '@wordpress/element';
import { Button, Icon } from '@wordpress/ui';
import { Spinner } from '@wordpress/components';
import { __ } from '@wordpress/i18n';
import { arrowLeft } from '@wordpress/icons';
import apiFetch from '@wordpress/api-fetch';
import { navigate } from '../../runtime/routing/router';
import { injectChromeHide } from '../_shared/iframe/chromeHide.mjs';

/**
 * Block editor via iframe. Handles existing posts and new post (auto-draft) flow.
 *
 * Routes (route table interpolates captures into `config`):
 *   #/editor/{postType}/{id}   — edit existing post
 *   #/editor/{postType}/new    — create auto-draft, then edit
 * @param {Object} root0
 * @param {Object} root0.config
 */
export default function EditorApp( { config = {} } ) {
	const postType = config.postType || 'post';
	const postIdParam = config.id;
	const isNew = postIdParam === 'new';

	const [ postId, setPostId ] = useState(
		isNew ? null : Number( postIdParam )
	);
	const [ isCreating, setIsCreating ] = useState( isNew );
	const [ error, setError ] = useState( null );
	const [ iframeLoading, setIframeLoading ] = useState( true );

	// Create auto-draft for new posts.
	useEffect( () => {
		if ( ! isNew ) {
			return;
		}

		let cancelled = false;

		async function createAutoDraft() {
			try {
				const result = await apiFetch( {
					path: `/wp/v2/${ postType === 'page' ? 'pages' : 'posts' }`,
					method: 'POST',
					data: {
						status: 'draft',
						title: '',
						// REST rejects fully-empty posts with
						// "Content, title, and excerpt are empty". Seed a
						// blank paragraph block so the auto-draft saves
						// even before the user types a title. SimpleEditorApp
						// uses the same placeholder.
						content:
							'<!-- wp:paragraph --><p></p><!-- /wp:paragraph -->',
					},
				} );

				if ( ! cancelled ) {
					setPostId( result.id );
					setIsCreating( false );
					// Update the URL without triggering a re-render loop.
					window.history.replaceState(
						null,
						'',
						`#/editor/${ postType }/${ result.id }`
					);
				}
			} catch ( err ) {
				if ( ! cancelled ) {
					setError(
						err?.message ||
							__( 'Failed to create draft.', 'wp-admin-shell' )
					);
					setIsCreating( false );
				}
			}
		}

		createAutoDraft();

		return () => {
			cancelled = true;
		};
	}, [ isNew, postType ] );

	const onIframeLoad = useCallback( ( event ) => {
		setIframeLoading( false );
		injectChromeHide( event.target );
	}, [] );

	// Determine which post list to go back to.
	const backRoute = postType === 'page' ? 'pages' : 'posts';

	if ( error ) {
		return (
			<div className="wp-admin-shell-app-editor">
				<div className="wp-admin-shell-app-editor__toolbar">
					<Button
						onClick={ () => navigate( backRoute ) }
						variant="minimal"
					>
						<Icon icon={ arrowLeft } size={ 16 } />
						{ __( 'Back to list', 'wp-admin-shell' ) }
					</Button>
				</div>
				<div className="wp-admin-shell-content__empty">{ error }</div>
			</div>
		);
	}

	if ( isCreating || ! postId ) {
		return (
			<div className="wp-admin-shell-app-editor">
				<div className="wp-admin-shell-app-editor__loading">
					<Spinner />
				</div>
			</div>
		);
	}

	const adminUrl = window.wpAdminShell?.adminUrl || '/wp-admin/';
	const editorUrl = `${ adminUrl }post.php?post=${ postId }&action=edit`;

	return (
		<div className="wp-admin-shell-app-editor">
			<div className="wp-admin-shell-app-editor__toolbar">
				<Button
					onClick={ () => navigate( backRoute ) }
					variant="minimal"
					size="compact"
				>
					<Icon icon={ arrowLeft } size={ 16 } />
					{ __( 'Back to list', 'wp-admin-shell' ) }
				</Button>
			</div>
			{ iframeLoading && (
				<div className="wp-admin-shell-app-editor__loading">
					<Spinner />
				</div>
			) }
			<iframe
				src={ editorUrl }
				title={ __( 'Editor', 'wp-admin-shell' ) }
				className="wp-admin-shell-app-editor__frame"
				onLoad={ onIframeLoad }
			/>
		</div>
	);
}
