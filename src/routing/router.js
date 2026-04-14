import { createContext, useState, useEffect, useContext } from '@wordpress/element';

const RouteContext = createContext( { path: [], hash: '' } );

export function RouterProvider( { children } ) {
	const [ hash, setHash ] = useState( window.location.hash );

	useEffect( () => {
		const handler = () => setHash( window.location.hash );
		window.addEventListener( 'hashchange', handler );
		return () => window.removeEventListener( 'hashchange', handler );
	}, [] );

	const path = hash
		.replace( /^#\/?/, '' )
		.split( '/' )
		.filter( Boolean );

	return (
		<RouteContext.Provider value={ { path, hash } }>
			{ children }
		</RouteContext.Provider>
	);
}

export function useRoute() {
	return useContext( RouteContext );
}

export function navigate( appId, ...params ) {
	window.location.hash = '#/' + [ appId, ...params ].join( '/' );
}
