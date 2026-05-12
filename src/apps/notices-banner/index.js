import './index.css';
import { Notice } from '@wordpress/ui';
import { useDispatch, useSelect } from '@wordpress/data';
import { store as noticesStore } from '@wordpress/notices';

/**
 * core:notices-banner — renders persistent, default-context notices
 * (info / error / warning / success) at the top of whatever region
 * pins this app. Sourced from `@wordpress/notices` so any app calling
 * `wp.data.dispatch('core/notices').createNotice(...)` lands here.
 *
 * Rendered by hand against `Notice.Root` from `@wordpress/ui` (the
 * WPDS-native primitive).
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
