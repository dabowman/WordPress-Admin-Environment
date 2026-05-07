import './index.css';
import { SnackbarList } from '@wordpress/components';
import { useDispatch, useSelect } from '@wordpress/data';
import { store as noticesStore } from '@wordpress/notices';

/**
 * core:notices-snackbar — same `@wordpress/notices` store as the
 * banner, snackbar context. Transient messages auto-dismiss; the user
 * can click to dismiss earlier.
 *
 * `SnackbarList` is kept from `@wordpress/components` because WPDS
 * 0.12 ships no snackbar primitive.
 */

export default function NoticesSnackbarApp() {
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
