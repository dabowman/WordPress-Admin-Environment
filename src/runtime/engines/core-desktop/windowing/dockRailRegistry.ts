/**
 * Dock rail renderer registry (P2.T3).
 *
 * Pluggable renderer registry for the `core:desktop-dock-app` body.
 * Plugin authors swap the entire dock rail by registering a React
 * component under a name, then point `regions.dock.config.renderer` at
 * that name in their shell's admin.json. The default name `'default'`
 * resolves to the two-group renderer the engine ships (launcher tiles
 * + live-window tiles).
 *
 * Scope simplification vs. upstream desktop-mode:
 *
 *   - React-first contract — renderers are React components, not
 *     imperative `mount(container)` controllers. Matches the rest of
 *     the codebase; saves the controller-lifecycle plumbing.
 *   - No multi-rail partitioning (classic core/plugin split, spatial
 *     wallpaper-icon overflow). One rail per region; shells that want
 *     two declare two regions.
 *   - No system-tile cohort, no attention modes, no submenu items.
 *     Those land as renderer-extension data once a plugin asks for them.
 *
 * Pure module, no DOM. Engines populate at module-load with their own
 * defaults; plugins add more at any time. Last-write wins on the
 * `'default'` slot — engine plugins can override the bundled default.
 */

import type { ComponentType } from 'react';
import type { IWindowManager, WindowEntry } from './WindowManager';

export interface DockRailRendererProps {
	/**
	 * Launcher items declared on the region's `config.items` block.
	 * Each entry is whatever the shell author authored — typically
	 * `{ label, icon?, app?, config?, href? }`. Renderers that want
	 * stronger typing should narrow per their own contract.
	 */
	items: ReadonlyArray< unknown >;
	/** Live window stack, last = topmost. */
	stack: ReadonlyArray< WindowEntry >;
	/**
	 * Resolved `routes` block from the active shell config. Renderers
	 * resolve `item.href` against this when an item declares no
	 * explicit `app`.
	 */
	routes: Record< string, unknown > | null;
	/** WindowManager for opening / focusing / closing windows. */
	manager: IWindowManager;
}

export type DockRailRenderer = ComponentType< DockRailRendererProps >;

const registry: Map< string, DockRailRenderer > = new Map();

/**
 * Register a renderer under a name. Calling twice overwrites — engine
 * plugins that want to replace the bundled `'default'` simply register
 * under the same name at module-load.
 * @param name
 * @param Component
 */
export function registerDockRailRenderer(
	name: string,
	Component: DockRailRenderer
): void {
	if ( typeof name !== 'string' || ! name ) {
		throw new TypeError(
			'registerDockRailRenderer: name must be a non-empty string'
		);
	}
	if ( typeof Component !== 'function' ) {
		throw new TypeError(
			'registerDockRailRenderer: Component must be a React component'
		);
	}
	registry.set( name, Component );
}

/**
 * Look up a renderer by name. Falls back to `'default'` when the
 * named renderer is absent. Returns `null` only when neither the
 * requested name nor the default is registered (shouldn't happen
 * in practice — the engine registers `'default'` at module-load).
 * @param name
 */
export function getDockRailRenderer(
	name: string | null | undefined
): DockRailRenderer | null {
	if ( typeof name === 'string' && name && registry.has( name ) ) {
		return registry.get( name ) ?? null;
	}
	return registry.get( 'default' ) ?? null;
}

/** Diagnostic — names currently registered. */
export function listDockRailRenderers(): ReadonlyArray< string > {
	return Array.from( registry.keys() );
}
