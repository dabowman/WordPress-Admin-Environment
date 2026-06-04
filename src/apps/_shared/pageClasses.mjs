/**
 * Pure structure/class helpers for the shared <Page> component.
 *
 * Extracted so node tests can pin the contract without a React/webpack harness
 * (the component itself imports `@wordpress/ui` + CSS and can't load in node).
 * Side-effect-free ESM — see `tests/runtime/page.test.mjs`.
 */

/**
 * Build the root + content class strings for a <Page>.
 *
 * @param {Object}  root0              Inputs.
 * @param {string}  [root0.className]  Extra root class names.
 * @param {boolean} [root0.hasPadding] Whether the content area is inset + scrolled.
 * @return {{ root: string, content: string }} Class strings.
 */
export function pageClasses( { className = '', hasPadding = false } = {} ) {
	return {
		root: [ 'wp-admin-workspaces-page', className ]
			.filter( Boolean )
			.join( ' ' ),
		content: [ 'wp-admin-workspaces-page__content', hasPadding && 'has-padding' ]
			.filter( Boolean )
			.join( ' ' ),
	};
}

/**
 * Whether a <Page> should render its header region — true when any header slot
 * is populated.
 *
 * @param {Object} slots            Header slot values.
 * @param {*}      [slots.title]    Title.
 * @param {*}      [slots.subTitle] Subtitle.
 * @param {*}      [slots.actions]  Actions.
 * @param {*}      [slots.badges]   Badges.
 * @param {*}      [slots.before]   Before-title content.
 * @return {boolean} True when the header should render.
 */
export function pageHasHeader( {
	title,
	subTitle,
	actions,
	badges,
	before,
} = {} ) {
	return Boolean( title || subTitle || actions || badges || before );
}

/**
 * Resolve the heading tag name for the title, clamped to h1–h6 (default h2).
 *
 * @param {number} [level] Requested heading level.
 * @return {string} A tag name, e.g. `'h2'`.
 */
export function headingTag( level = 2 ) {
	const n = Number.isInteger( level ) && level >= 1 && level <= 6 ? level : 2;
	return `h${ n }`;
}
