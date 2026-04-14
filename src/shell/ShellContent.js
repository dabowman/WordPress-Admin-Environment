import { __ } from '@wordpress/i18n';
import { resolveSource } from '../config/sourceRegistry';
import { useCurrentApp } from '../routing/useCurrentApp';

/**
 * Content region — resolves the current route to an application component.
 */
export function ShellContent( { config } ) {
	const { app, params } = useCurrentApp( config );

	if ( ! app ) {
		return (
			<div className="wp-admin-shell-content__empty">
				{ __( 'Page not found.', 'wp-admin-shell' ) }
			</div>
		);
	}

	const AppComponent = resolveSource( app.source );

	if ( ! AppComponent ) {
		return (
			<div className="wp-admin-shell-content__empty">
				{ __( 'Unknown application source:', 'wp-admin-shell' ) }{ ' ' }
				{ app.source }
			</div>
		);
	}

	const isIframe = app.source.startsWith( 'iframe:' );

	return (
		<div
			className={ `wp-admin-shell-content__app${
				isIframe ? ' is-iframe' : ''
			}` }
		>
			<AppComponent
				app={ app }
				config={ app.config }
				params={ params }
			/>
		</div>
	);
}
