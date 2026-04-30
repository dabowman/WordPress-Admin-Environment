/**
 * core:notices-banner / core:notices-snackbar — M1 stubs.
 *
 * Spec §11 / plan M1.8 ships these as no-op mount points so shell configs
 * can pin them; the real `@wordpress/notices`-backed implementation lands
 * in M4. Two distinct apps so banner-vs-snackbar pinning is stable.
 */

export function NoticesBannerApp() {
	return null;
}

export function NoticesSnackbarApp() {
	return null;
}
