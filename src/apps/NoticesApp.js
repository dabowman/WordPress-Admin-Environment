import { Notice } from '@wordpress/ui';
import { SnackbarList } from '@wordpress/components';
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
 *
 * Banner is rendered by hand against `Notice.Root` from `@wordpress/ui`
 * (the WPDS-native primitive). `SnackbarList` is kept from
 * `@wordpress/components` because WPDS 0.12 ships no snackbar primitive.
 */

const INTENT_BY_STATUS = {
	error: 'error',
	warning: 'warning',
	success: 'success',
	info: 'info',
};

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
