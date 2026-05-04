import {
	NoticeList,
	SnackbarList,
} from '@wordpress/components';
import { useDispatch, useSelect } from '@wordpress/data';
import { store as noticesStore } from '@wordpress/notices';

/**
 * core:notices-banner — renders persistent, default-context notices
 * (info / error / warning / success) at the top of whatever region
 * pins this app. Sourced from `@wordpress/notices` so any app calling
 * `wp.data.dispatch('core/notices').createNotice(...)` lands here.
 *
 * core:notices-snackbar — same store, snackbar context. Transient
 * messages auto-dismiss; the user can click to dismiss earlier.
 *
 * Pinning: every bundled shell pins both into named regions through the
 * v0 normalizer (M4.6) so apps can rely on a single store-driven
 * location regardless of which shell mounted them.
 */

export function NoticesBannerApp() {
	const notices = useSelect(
		( select ) => select( noticesStore ).getNotices(),
		[]
	);
	const { removeNotice } = useDispatch( noticesStore );

	const visible = ( notices || [] ).filter( ( n ) => n.type === 'default' );
	if ( visible.length === 0 ) {
		return null;
	}

	return (
		<div className="wp-admin-shell-notices-banner">
			<NoticeList
				notices={ visible }
				onRemove={ removeNotice }
			/>
		</div>
	);
}

export function NoticesSnackbarApp() {
	const notices = useSelect(
		( select ) => select( noticesStore ).getNotices(),
		[]
	);
	const { removeNotice } = useDispatch( noticesStore );

	const visible = ( notices || [] ).filter( ( n ) => n.type === 'snackbar' );

	return (
		<SnackbarList
			notices={ visible }
			className="wp-admin-shell-notices-snackbar"
			onRemove={ removeNotice }
		/>
	);
}
