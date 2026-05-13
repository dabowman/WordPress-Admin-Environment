/**
 * `core:desktop` engine icon table.
 *
 * MVP set — enough for the dock + window-frame chrome. Per spec §13, icons
 * live in the engine, not the kernel. P2 ships the minimum vocabulary;
 * P3+ subsystems (palette/AI/wallpaper picker) extend it as they land.
 *
 * Reuses `@wordpress/icons` because the bundled apps mounted inside
 * windows already do, and authoring a separate icon set for the desktop
 * engine alone would balloon the port. Engines that want a Material or
 * brand-locked icon set ship their own table.
 */

import {
	close,
	chevronUp,
	chevronDown,
	cog,
	external,
	layout,
	media,
	page,
	people,
	plus,
	post,
	plugins,
	tool,
	wordpress,
} from '@wordpress/icons';

const placeholder = wordpress;

export const iconTable = {
	close,
	minimize: chevronDown,
	maximize: chevronUp,
	settings: cog,
	external,
	layout,
	media,
	page,
	people,
	plus,
	post,
	plugins,
	tool,
	wordpress,
};

export const fallbackIcon = placeholder;
