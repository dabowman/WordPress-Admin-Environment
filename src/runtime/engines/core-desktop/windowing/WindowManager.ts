/**
 * core:desktop — WindowManager (MVP slice).
 *
 * Pure state machine for the desktop window stack. No DOM, no React, no
 * subscriptions to anything outside its own listeners — this lets the
 * class be unit-tested in isolation and reused from non-DOM environments.
 *
 * Scope of this slice (P2.T2 MVP):
 *   - open / close / focus / minimize / restore / maximize
 *   - monotonically-rising zIndex on focus
 *   - cascade-positioned starting rect for new windows
 *   - subscribe / unsubscribe API the React layer wraps with
 *     `useSyncExternalStore`
 *
 * Deferred to follow-up commits (full upstream port):
 *   - drag / resize / snap-zones (imperative DOM in `pointer.ts` etc.)
 *   - tabs, menus, native-window hydration, activity-state indicator
 *   - virtual desktops ("spaces") — single workspace for MVP
 *   - session save/restore — wired once the dynamic-children store
 *     stabilizes
 *
 * The conceptual API matches `desktop-mode/src/window-manager/index.ts`
 * closely enough that the verbatim port can extend this class (or swap
 * it via a re-export) without disturbing the compositor app or any
 * consumer of `WindowManagerContext`.
 */

/** Base z-index for desktop windows. Matches upstream `BASE_Z_INDEX`. */
const BASE_Z_INDEX = 100;

/** Cascade offset for new windows, in CSS pixels. */
const CASCADE_OFFSET = 30;

/** Default size if the app manifest doesn't specify one. */
const DEFAULT_SIZE = { w: 960, h: 720 };

/** Default starting top-left for the first window. */
const DEFAULT_ORIGIN = { x: 80, y: 60 };

export type WindowState = 'normal' | 'minimized' | 'maximized';

export interface WindowRect {
	x: number;
	y: number;
	w: number;
	h: number;
}

export interface OpenWindowArgs {
	/** App id to mount in the window body (e.g. `core:posts`). */
	app: string;
	/** Optional config object passed to the body app. */
	config?: Record< string, unknown >;
	/** Optional human-readable title; frame uses this when set. */
	title?: string;
	/** Optional initial size; falls back to `DEFAULT_SIZE`. */
	size?: { w: number; h: number };
}

export interface WindowEntry {
	/** Stable identifier — used as the dynamic-children key. */
	id: string;
	/** App id mounted in the window's body region. */
	app: string;
	/** Frozen config snapshot passed to the body app. */
	config: Record< string, unknown >;
	/** Title shown in the frame's titlebar. */
	title: string;
	/** Current state (normal | minimized | maximized). */
	state: WindowState;
	/** CSS pixels — drives `transform: translate(...)` + width/height. */
	rect: WindowRect;
	/** Z-stack ordering; highest = topmost. */
	zIndex: number;
}

export type Listener = ( stack: ReadonlyArray< WindowEntry > ) => void;

/**
 * The minimum WindowManager surface the compositor + dock + frame need.
 *
 * Exposed as an interface so the verbatim upstream port can implement it
 * without us re-typing the compositor against the eventual class shape.
 */
export interface IWindowManager {
	getStack: () => ReadonlyArray< WindowEntry >;
	openWindow: ( args: OpenWindowArgs ) => string;
	closeWindow: ( id: string ) => void;
	focusWindow: ( id: string ) => void;
	minimizeWindow: ( id: string ) => void;
	restoreWindow: ( id: string ) => void;
	maximizeWindow: ( id: string ) => void;
	subscribe: ( listener: Listener ) => () => void;
}

export class WindowManager implements IWindowManager {
	private stack: WindowEntry[] = [];
	private listeners = new Set< Listener >();
	private idSeq = 0;
	private zSeq = BASE_Z_INDEX;
	private cascadeIndex = 0;

	getStack(): ReadonlyArray< WindowEntry > {
		return this.stack;
	}

	openWindow( args: OpenWindowArgs ): string {
		this.idSeq += 1;
		const id = `win-${ this.idSeq }`;
		const size = args.size ?? DEFAULT_SIZE;
		const origin = {
			x: DEFAULT_ORIGIN.x + this.cascadeIndex * CASCADE_OFFSET,
			y: DEFAULT_ORIGIN.y + this.cascadeIndex * CASCADE_OFFSET,
		};
		this.cascadeIndex = ( this.cascadeIndex + 1 ) % 12;
		this.zSeq += 1;
		const entry: WindowEntry = {
			id,
			app: args.app,
			config: args.config ?? {},
			title: args.title ?? args.app,
			state: 'normal',
			rect: { x: origin.x, y: origin.y, w: size.w, h: size.h },
			zIndex: this.zSeq,
		};
		this.stack = [ ...this.stack, entry ];
		this.emit();
		return id;
	}

	closeWindow( id: string ): void {
		const next = this.stack.filter( ( w ) => w.id !== id );
		if ( next.length === this.stack.length ) {
			return;
		}
		this.stack = next;
		this.emit();
	}

	focusWindow( id: string ): void {
		const idx = this.stack.findIndex( ( w ) => w.id === id );
		if ( idx < 0 ) {
			return;
		}
		const existing = this.stack[ idx ];
		if ( existing.zIndex === this.zSeq && existing.state !== 'minimized' ) {
			return;
		}
		this.zSeq += 1;
		this.stack = this.stack.map( ( w ) =>
			w.id === id
				? {
						...w,
						zIndex: this.zSeq,
						state: w.state === 'minimized' ? 'normal' : w.state,
				  }
				: w
		);
		this.emit();
	}

	minimizeWindow( id: string ): void {
		this.patch( id, ( w ) =>
			w.state === 'minimized' ? null : { ...w, state: 'minimized' }
		);
	}

	restoreWindow( id: string ): void {
		this.patch( id, ( w ) =>
			w.state === 'normal' ? null : { ...w, state: 'normal' }
		);
	}

	maximizeWindow( id: string ): void {
		this.patch( id, ( w ) =>
			w.state === 'maximized'
				? { ...w, state: 'normal' }
				: { ...w, state: 'maximized' }
		);
	}

	subscribe( listener: Listener ): () => void {
		this.listeners.add( listener );
		return () => {
			this.listeners.delete( listener );
		};
	}

	private patch(
		id: string,
		mut: ( w: WindowEntry ) => WindowEntry | null
	): void {
		const idx = this.stack.findIndex( ( w ) => w.id === id );
		if ( idx < 0 ) {
			return;
		}
		const next = mut( this.stack[ idx ] );
		if ( ! next ) {
			return;
		}
		this.stack = this.stack.map( ( w ) => ( w.id === id ? next : w ) );
		this.emit();
	}

	private emit(): void {
		for ( const listener of this.listeners ) {
			listener( this.stack );
		}
	}
}
