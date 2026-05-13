/**
 * core:desktop-window-frame — P2.T1 placeholder.
 *
 * P2.T2 fills with React frame chrome: titlebar, traffic-light controls,
 * resize handles, drag-region affordances. Controls invoke handlers
 * registered by the compositor via `WindowManagerContext`. For now:
 * minimal title-bar div so windows look like windows in smoke testing.
 */

export default function DesktopWindowFrameApp( { config } ) {
	const title =
		( config && typeof config.title === 'string' && config.title ) ||
		'Window';
	return (
		<div className="wp-admin-shell-desktop-window-frame">
			<div className="wp-admin-shell-desktop-window-frame__titlebar">
				<span className="wp-admin-shell-desktop-window-frame__title">
					{ title }
				</span>
			</div>
		</div>
	);
}
