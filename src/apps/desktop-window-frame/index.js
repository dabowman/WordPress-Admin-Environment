/**
 * core:desktop-window-frame — window chrome (P2.T2 MVP).
 *
 * Mounted in each window's `frame` sub-region by the compositor. Reads
 * the window's live state via `useWindowEntry(windowId)` and dispatches
 * close / minimize / maximize back through `useWindowManager()`.
 *
 * Visual scope for MVP: titlebar, three traffic-light controls. Drag
 * handle on the titlebar is wired but no-ops for now — drag/resize land
 * in a follow-up that mutates `WindowManager` rects via pointer events
 * (imperative DOM during pointer-move, commit on pointer-up — verbatim
 * upstream pattern).
 */

import {
	useWindowManager,
	useWindowEntry,
} from '../../runtime/engines/core-desktop/windowing/WindowManagerContext';

export default function DesktopWindowFrameApp( { config } ) {
	const windowId =
		config && typeof config.windowId === 'string' ? config.windowId : null;
	const manager = useWindowManager();
	const win = useWindowEntry( windowId || '' );

	if ( ! windowId || ! win ) {
		return null;
	}

	const title = win.title;
	const focus = () => manager.focusWindow( windowId );
	const onClose = () => {
		focus();
		manager.closeWindow( windowId );
	};
	const onMinimize = () => {
		focus();
		manager.minimizeWindow( windowId );
	};
	const onMaximize = () => {
		focus();
		manager.maximizeWindow( windowId );
	};

	return (
		<div className="wp-admin-shell-desktop-window-frame">
			<div className="wp-admin-shell-desktop-window-frame__titlebar">
				<div
					className="wp-admin-shell-desktop-window-frame__controls"
					role="group"
					aria-label="Window controls"
				>
					<button
						type="button"
						className="wp-admin-shell-desktop-window-frame__control wp-admin-shell-desktop-window-frame__control--close"
						aria-label="Close window"
						onClick={ onClose }
					/>
					<button
						type="button"
						className="wp-admin-shell-desktop-window-frame__control wp-admin-shell-desktop-window-frame__control--minimize"
						aria-label="Minimize window"
						onClick={ onMinimize }
					/>
					<button
						type="button"
						className="wp-admin-shell-desktop-window-frame__control wp-admin-shell-desktop-window-frame__control--maximize"
						aria-label={
							win.state === 'maximized'
								? 'Restore window'
								: 'Maximize window'
						}
						onClick={ onMaximize }
					/>
				</div>
				<span className="wp-admin-shell-desktop-window-frame__title">
					{ title }
				</span>
			</div>
		</div>
	);
}
