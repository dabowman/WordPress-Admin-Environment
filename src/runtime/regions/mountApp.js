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
import { userCan } from '../capabilities/userCan';

export function MountedApp( { appRef, regionId, segments, fallback = null } ) {
	const { registry, config } = useKernel();

	const appInstance = resolveAppInstance( appRef, config );
	if ( ! appInstance ) {
		return null;
	}

	// Spec §8 layer 2 — apps with `capability` are hidden from rendering.
	if ( appInstance.capability && ! userCan( appInstance.capability ) ) {
		return fallback;
	}

	const sourceDef = resolveAppSource( appInstance.source, registry );
	if ( ! sourceDef ) {
		return (
			<div className="wp-admin-shell-content__empty">
				Unknown source: { appInstance.source }
			</div>
		);
	}

	// Spec §8 layer 3 — source-declared capability floor. Even if the
	// shell config omits `capability`, the source's required caps still
	// apply.
	const sourceCaps = Array.isArray( sourceDef.capabilities ) ? sourceDef.capabilities : [];
	for ( const cap of sourceCaps ) {
		if ( ! userCan( cap ) ) {
			return fallback;
		}
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
		const apps = getApplications( config );
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

/**
 * Pull the applications list off a resolved config. v1 canonical path
 * is `settings.applications`; v0 mirrors at top-level. Read the v1 path
 * first so v1-shape shells work without depending on the v0 mirrors.
 */
export function getApplications( config ) {
	return toApplicationList(
		config?.settings?.applications || config?.applications
	);
}
