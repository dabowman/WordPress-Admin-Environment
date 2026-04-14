import { useRoute } from './router';

/**
 * Resolves the current hash route to an application from the config.
 *
 * @param {Object} config - The resolved admin.json configuration.
 * @return {{ app: Object|null, params: string[] }}
 */
export function useCurrentApp( config ) {
	const { path } = useRoute();
	const appId = path[ 0 ] || config.defaultApp;
	const app = config.applications.find( ( a ) => a.id === appId );
	const params = path.slice( 1 );
	return { app, params };
}
