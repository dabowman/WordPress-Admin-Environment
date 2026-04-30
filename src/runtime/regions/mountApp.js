/**
 * Shared region helper: render a single contained app instance.
 *
 * `appRef` may be either:
 *   - a string app id (resolved against `config.applications` and the registry),
 *   - or a fully-formed app instance object (the runtime path the kernel
 *     uses when it pre-resolves contained apps before mounting regions).
 *
 * Regions delegate to this helper to keep the resolution path uniform.
 */
import { useKernel } from '../kernel-context';
import { Slot } from '../slots/Slot';

export function MountedApp( { appRef, regionId, segments } ) {
	const { registry, config } = useKernel();

	const appInstance = resolveAppInstance( appRef, config );
	if ( ! appInstance ) {
		return null;
	}

	const sourceDef = resolveAppSource( appInstance.source, registry );
	if ( ! sourceDef ) {
		return (
			<div className="wp-admin-shell-content__empty">
				Unknown source: { appInstance.source }
			</div>
		);
	}

	const Component = sourceDef.Component;
	const mergedConfig = { ...( sourceDef.defaults || {} ), ...( appInstance.config || {} ) };

	const fillProps = {
		appId:    appInstance.id,
		source:   appInstance.source,
		regionId,
	};

	return (
		<div data-app-id={ appInstance.id } data-app-source={ appInstance.source } style={ { display: 'contents' } }>
			<Slot name="core:app.before" fillProps={ fillProps } />
			<Component
				app={ appInstance }
				config={ mergedConfig }
				regionId={ regionId }
				segments={ segments || [] }
			/>
			<Slot name="core:app.after" fillProps={ fillProps } />
		</div>
	);
}

function resolveAppInstance( appRef, config ) {
	if ( ! appRef ) {
		return null;
	}
	if ( typeof appRef === 'string' ) {
		const apps = toApplicationList( config.applications );
		return apps.find( ( a ) => a.id === appRef ) || null;
	}
	return appRef;
}

function resolveAppSource( source, registry ) {
	if ( ! source ) {
		return null;
	}
	const direct = registry.get( source, 'app' );
	if ( direct ) {
		return direct;
	}
	if ( source.startsWith( 'iframe:' ) ) {
		return registry.get( 'core:iframe-fallback', 'app' );
	}
	return null;
}

export function toApplicationList( applications ) {
	if ( ! applications ) {
		return [];
	}
	if ( Array.isArray( applications ) ) {
		return applications;
	}
	// v1 spec uses { id: { source, ... } } map form.
	return Object.entries( applications ).map( ( [ id, body ] ) => ( {
		id,
		...body,
	} ) );
}
