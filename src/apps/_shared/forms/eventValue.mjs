/**
 * Extract the value from a DOM change event. `@wordpress/ui` form controls
 * (`InputControl`, etc.) hand `onChange` a native event, not the raw value —
 * unlike legacy `@wordpress/components` `TextControl`. This one-liner was
 * copy-pasted across profile / settings / media; share it instead.
 *
 * Pure (no imports).
 *
 * @param {Event} e Change event from a `@wordpress/ui` control.
 * @return {string} `e.target.value`.
 */
export function eventValue( e ) {
	return e.target.value;
}
