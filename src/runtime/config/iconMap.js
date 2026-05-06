import {
	post,
	page,
	media,
	pencil,
	settings,
	people,
	plugins,
	layout,
	external,
	plus,
	tool,
	drafts,
	wordpress,
	search,
	styles,
	navigation,
	symbol,
	category,
	dashboard,
	comment,
	brush,
	home,
	tag,
	update,
} from '@wordpress/icons';

const iconMap = {
	post,
	page,
	media,
	edit: pencil,
	pencil,
	settings,
	user: people,
	people,
	plugins,
	layout,
	external,
	plus,
	wrench: tool,
	tool,
	draft: drafts,
	drafts,
	search,
	wordpress,
	styles,
	navigation,
	symbol,
	category,
	dashboard,
	comment,
	comments: comment,
	brush,
	appearance: brush,
	home,
	tag,
	update,
};

const IS_DEV =
	typeof process !== 'undefined' && process.env?.NODE_ENV !== 'production';

const warned = new Set();

/**
 * Resolve an icon name string to a `@wordpress/icons` component.
 *
 * Falls back to the `wordpress` icon when the name misses. In dev
 * mode, the first miss per name emits a console warning so authors
 * see the typo without needing a dedicated lint pass. Production
 * stays silent — the wordpress fallback is acceptable visual behavior.
 *
 * Empty / undefined `name` is treated as "no icon requested" and
 * does not warn.
 */
export function resolveIcon( name ) {
	if ( ! name ) {
		return wordpress;
	}
	const icon = iconMap[ name ];
	if ( icon ) {
		return icon;
	}
	if ( IS_DEV && ! warned.has( name ) ) {
		warned.add( name );
		// eslint-disable-next-line no-console
		console.warn(
			`wp-admin-shell iconMap: unknown icon name "${ name }"; falling back to wordpress icon. Add the mapping to src/runtime/config/iconMap.js or pick a known name. Known: ${ Object.keys( iconMap ).sort().join( ', ' ) }`
		);
	}
	return wordpress;
}
