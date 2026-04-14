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
};

export function resolveIcon( name ) {
	return iconMap[ name ] || wordpress;
}
