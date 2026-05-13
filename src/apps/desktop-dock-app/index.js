/**
 * core:desktop-dock-app — P2.T1 placeholder.
 *
 * P2.T3 fills with the ported dock rail renderer registry from
 * `desktop-mode/src/dock-rail/*` and the navigation-derived tile set
 * reading `useKernel().config.navigation`. For now: empty dock so the
 * region resolves + smoke renders.
 */

export default function DesktopDockApp() {
	return (
		<div
			className="wp-admin-shell-desktop-dock"
			aria-label="Application dock"
		/>
	);
}
