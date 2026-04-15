import { __ } from '@wordpress/i18n';
import { resolveSource } from '../config/sourceRegistry';
import { useCurrentApp } from '../routing/useCurrentApp';

/**
 * Content region — resolves the current route to application component(s)
 * and renders them as elevated cards on the dark chrome background.
 *
 * Supports a multi-area model inspired by the site editor:
 * - `contentWidth` on an app narrows the primary card and shows a preview area
 * - `areas.preview` on an app config specifies a secondary app for the right panel
 *
 * When no preview is configured, the content card fills the available space.
 */
export function ShellContent( { config } ) {
	const { app, params } = useCurrentApp( config );

	if ( ! app ) {
		return (
			<div className="wp-admin-shell-areas">
				<main className="wp-admin-shell-content">
					<div className="wp-admin-shell-content__empty">
						{ __( 'Page not found.', 'wp-admin-shell' ) }
					</div>
				</main>
			</div>
		);
	}

	const AppComponent = resolveSource( app.source );

	if ( ! AppComponent ) {
		return (
			<div className="wp-admin-shell-areas">
				<main className="wp-admin-shell-content">
					<div className="wp-admin-shell-content__empty">
						{ __( 'Unknown application source:', 'wp-admin-shell' ) }{ ' ' }
						{ app.source }
					</div>
				</main>
			</div>
		);
	}

	const isFullscreen =
		app.source.startsWith( 'iframe:' ) || app.source === 'core:editor';

	const contentWidth = app.config?.contentWidth;
	const previewAppId = app.config?.preview;
	const previewApp = previewAppId
		? config.applications.find( ( a ) => a.id === previewAppId )
		: null;
	const PreviewComponent = previewApp
		? resolveSource( previewApp.source )
		: null;

	const hasPreview = !! PreviewComponent;

	return (
		<div
			className={ `wp-admin-shell-areas${
				hasPreview ? ' has-preview' : ''
			}` }
		>
			<main
				className={ `wp-admin-shell-content${
					isFullscreen ? ' is-fullscreen' : ''
				}` }
				style={
					contentWidth
						? { maxWidth: contentWidth, flexGrow: 0, flexShrink: 0 }
						: undefined
				}
			>
				<div
					className={ `wp-admin-shell-content__app${
						isFullscreen ? ' is-iframe' : ''
					}` }
				>
					<AppComponent
						app={ app }
						config={ app.config }
						params={ params }
					/>
				</div>
			</main>

			{ hasPreview && (
				<div className="wp-admin-shell-preview">
					<div className="wp-admin-shell-content__app">
						<PreviewComponent
							app={ previewApp }
							config={ previewApp.config }
							params={ params }
						/>
					</div>
				</div>
			) }
		</div>
	);
}
