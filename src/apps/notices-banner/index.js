import './index.css';
import { Notice } from '@wordpress/ui';
import { useState } from '@wordpress/element';
import { useDispatch, useSelect } from '@wordpress/data';
import { store as noticesStore } from '@wordpress/notices';

/**
 * core:notices-banner — renders persistent, default-context notices
 * (info / error / warning / success) at the top of whatever region
 * pins this app. Two sources:
 *
 *   1. `@wordpress/notices` (default context) — any app calling
 *      `wp.data.dispatch('core/notices').createNotice(...)` lands here,
 *      rendered against `Notice.Root` from `@wordpress/ui`.
 *   2. **admin_notices harvest (#128)** — global `admin_notices` HTML
 *      buffered server-side (`window.wpAdminShell.adminNotices`) so an
 *      un-ported plugin's notice still surfaces. The captured markup is
 *      admin-context (same trust as classic wp-admin) and rendered
 *      unchanged. Locally dismissible (the markup is static — there's no
 *      store entry to remove).
 *
 *      **Documented limitation.** `admin_notices` is a per-page-render
 *      hook; only GLOBAL notices that fire on the shell's own page load
 *      are captured. Per-screen notices keyed on `$pagenow` / the current
 *      screen don't fire and aren't surfaced. Global-only is the accepted
 *      interim (the proper fix is a notices REST surface — upstream #155).
 */

const INTENT_BY_STATUS = {
	error: 'error',
	warning: 'warning',
	success: 'success',
	info: 'info',
};

export default function NoticesBannerApp() {
	const notices = useSelect(
		( select ) => select( noticesStore ).getNotices(),
		[]
	);
	const { removeNotice } = useDispatch( noticesStore );

	// Harvested admin_notices HTML (#128). Read once at mount — it's a
	// static server-render snapshot. Locally dismissible.
	const harvestedHtml =
		typeof window?.wpAdminShell?.adminNotices === 'string'
			? window.wpAdminShell.adminNotices
			: '';
	const [ showHarvested, setShowHarvested ] = useState(
		harvestedHtml !== ''
	);

	const visible = ( notices || [] ).filter( ( n ) => n.type === 'default' );
	if ( visible.length === 0 && ! ( showHarvested && harvestedHtml ) ) {
		return null;
	}

	return (
		<div className="wp-admin-shell-notices-banner">
			{ visible.map( ( notice ) => (
				<Notice.Root
					key={ notice.id }
					intent={ INTENT_BY_STATUS[ notice.status ] || 'info' }
				>
					<Notice.Description>{ notice.content }</Notice.Description>
					{ notice.isDismissible && (
						<Notice.Actions>
							<Notice.CloseIcon
								onClick={ () => removeNotice( notice.id ) }
							/>
						</Notice.Actions>
					) }
				</Notice.Root>
			) ) }
			{ showHarvested && harvestedHtml && (
				<Notice.Root intent="neutral">
					<Notice.Description>
						<div
							className="wp-admin-shell-notices-banner__harvested"
							// eslint-disable-next-line react/no-danger -- admin-context admin_notices HTML; same trust as classic wp-admin (see runtime-harvest-pattern.md).
							dangerouslySetInnerHTML={ {
								__html: harvestedHtml,
							} }
						/>
					</Notice.Description>
					<Notice.Actions>
						<Notice.CloseIcon
							onClick={ () => setShowHarvested( false ) }
						/>
					</Notice.Actions>
				</Notice.Root>
			) }
		</div>
	);
}
