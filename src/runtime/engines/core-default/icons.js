/**
 * `core:default` engine icon table.
 *
 * Names match the strings authors reference from admin.json (`app.icon`,
 * nav items, command-palette commands, etc.). The engine registers this
 * table with the kernel icon registry at module-load time via
 * `registerIcons()`; apps look up icons through `resolveIcon()` without
 * knowing which engine populated the table.
 *
 * Adding a new icon name: import it here, drop it in the table object,
 * and authors can reference it. The kernel registry warns once per
 * unknown name in dev mode.
 */

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
	trash,
	check,
	closeSmall,
	copy,
	upload,
	chevronUp,
	chevronDown,
	chevronLeft,
	chevronRight,
} from '@wordpress/icons';

export const iconTable = {
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
	trash,
	check,
	closeSmall,
	copy,
	upload,
	chevronUp,
	chevronDown,
	chevronLeft,
	chevronRight,
};

export const fallbackIcon = wordpress;
