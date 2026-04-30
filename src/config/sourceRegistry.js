import PostsApp from '../apps/PostsApp';
import EditorApp from '../apps/EditorApp';
import SimpleEditorApp from '../apps/SimpleEditorApp';
import MediaApp from '../apps/MediaApp';
import ProfileApp from '../apps/ProfileApp';
import SettingsGeneralApp from '../apps/SettingsGeneralApp';
import IframeApp from '../apps/IframeApp';

const sourceRegistry = {};

function register( source, component ) {
	sourceRegistry[ source ] = component;
}

register( 'core:posts', PostsApp );
register( 'core:editor', EditorApp );
register( 'core:simple-editor', SimpleEditorApp );
register( 'core:media', MediaApp );
register( 'core:profile', ProfileApp );
register( 'core:settings-general', SettingsGeneralApp );

/**
 * Resolves a source string to a React component.
 * Handles the iframe: prefix dynamically.
 *
 * @param {string} source - The source string from admin.json.
 * @return {Function|null} The React component, or null if not found.
 */
export function resolveSource( source ) {
	if ( ! source ) {
		return null;
	}
	if ( source.startsWith( 'iframe:' ) ) {
		return IframeApp;
	}
	return sourceRegistry[ source ] || null;
}
