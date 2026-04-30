/**
 * emitTokens — flatten the compiled-styles output into a CSS string and
 * inject it as `<style id="wp-admin-shell-tokens">` so it loads before
 * the shell's own stylesheet rules cascade.
 *
 * Three families, written in this order (per spec §4.3.2):
 *   1. WPDS surface
 *   2. Chrome extensions
 *   3. Compat bridge (static aliases — last so they win on the cascade)
 *
 * Per-region / per-app scoped overrides live under
 * `[data-region-id="…"]` / `[data-app-id="…"]` selectors after the root.
 *
 * The function returns the CSS string and (when running in a browser)
 * also updates a singleton `<style>` tag so callers don't have to manage
 * the DOM side-effect themselves.
 */

import { compileStyles } from './compileStyles';
import { buildCompatBridge } from './compatBridge';

const STYLE_ID = 'wp-admin-shell-tokens';

export function emitTokensCss( styles ) {
	const compiled = compileStyles( styles );
	const compat   = buildCompatBridge( compiled.wpds );

	const lines = [];

	// Emit the global token surface at `:root` so portal-mounted UI
	// (command palette, dropdowns, modals — anything @wordpress/components
	// renders outside the #wp-admin-shell DOM via portal) inherits the
	// shell's overrides. The shell's chrome elements live inside
	// `#wp-admin-shell` and inherit through the same root.
	lines.push( ':root {' );
	for ( const [ name, value ] of Object.entries( compiled.wpds ) ) {
		lines.push( `\t${ name }: ${ value };` );
	}
	for ( const [ name, value ] of Object.entries( compiled.chrome ) ) {
		lines.push( `\t${ name }: ${ value };` );
	}
	for ( const [ name, value ] of Object.entries( compat ) ) {
		lines.push( `\t${ name }: ${ value };` );
	}
	lines.push( '}' );

	// Per-region / per-app scoped overrides — narrower selectors win
	// for descendants of those regions/apps without leaking outside.
	for ( const [ scopeKey, vars ] of Object.entries( compiled.scoped ) ) {
		const selector = scopeToSelector( scopeKey );
		if ( ! selector ) {
			continue;
		}
		lines.push( `${ selector } {` );
		for ( const [ name, value ] of Object.entries( vars ) ) {
			lines.push( `\t${ name }: ${ value };` );
		}
		lines.push( '}' );
	}

	return lines.join( '\n' );
}

export function injectTokens( styles ) {
	const css = emitTokensCss( styles );
	if ( typeof document === 'undefined' ) {
		return css;
	}
	let tag = document.getElementById( STYLE_ID );
	if ( ! tag ) {
		tag = document.createElement( 'style' );
		tag.id = STYLE_ID;
		document.head.appendChild( tag );
	}
	tag.textContent = css;
	return css;
}

function scopeToSelector( scopeKey ) {
	if ( scopeKey.startsWith( 'region:' ) ) {
		return `#wp-admin-shell [data-region-id="${ scopeKey.slice( 7 ) }"]`;
	}
	if ( scopeKey.startsWith( 'app:' ) ) {
		return `#wp-admin-shell [data-app-id="${ scopeKey.slice( 4 ) }"]`;
	}
	return null;
}
