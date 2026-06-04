import '../app.css';
import { DataForm, useFormValidity } from '@wordpress/dataviews/wp';
import { useEntityRecord } from '@wordpress/core-data';
import { Button, Stack, Text } from '@wordpress/ui';
import { Spinner } from '@wordpress/components';
import { __ } from '@wordpress/i18n';
import { useEntitySave } from './useEntitySave';
import { Page } from '../Page';

/**
 * Shared `useEntityRecord` + `DataForm` shell for single-record edit screens
 * (profile, settings panels). Owns the null-guard spinner, the `DataForm`
 * wiring (`data` = `editedRecord`, `onChange` = `edit`), and the Save button +
 * its notice handling. The caller supplies only the field definitions, the
 * form layout, and entity coordinates.
 *
 * `DataForm`'s `onChange` hands back the same partial-object shape
 * `useEntityRecord`'s `edit` expects, so they wire together directly.
 *
 * Pass `title` to render the form inside the shared <Page> chrome (a bordered
 * header bar carrying the title, above the inset form + Save button) — the
 * standard for a full-screen settings/profile form. Omit `title` (optionally
 * passing the legacy inline `heading`) for embedded use (e.g. inside a modal),
 * where the form renders as a plain inset block with no header bar.
 *
 * @param {Object} root0
 * @param {Array}  root0.entity           Entity coords spread into `useEntityRecord` (e.g. `[ 'root', 'site' ]`).
 * @param {Array}  root0.fields           DataForm field definitions.
 * @param {Object} root0.form             DataForm `form` layout config.
 * @param {string} [root0.title]          Page header title. When set, wraps the form in <Page>.
 * @param {string} [root0.heading]        Legacy inline `<h2>` heading (used only when `title` is absent).
 * @param {string} [root0.headingVariant] WPDS Text variant for the legacy inline heading.
 * @param {string} [root0.saveLabel]      Save button label.
 * @param {Object} [root0.messages]       `{ success, error }` for the save notices.
 * @param {string} [root0.className]      Class applied to the form body (e.g. a `max-width` constraint).
 * @param {Node}   [root0.children]       Extra content rendered between the form and the Save button.
 * @return {JSX.Element} The form shell.
 */
export function EntityDataForm( {
	entity,
	fields,
	form,
	title,
	heading,
	headingVariant = 'heading-xl',
	saveLabel,
	messages,
	className,
	children,
} ) {
	const { record, editedRecord, edit, save, hasEdits, isSaving } =
		useEntityRecord( ...entity );
	const handleSave = useEntitySave( save, messages );

	// Live field validation: enforces author-declared `isValid` rules plus the
	// type-default `elements`-membership check DataViews auto-enables for any
	// option-backed field that doesn't opt out (`isValid: { elements: false }`).
	// Must run before the null-guard early return so hook order stays stable.
	// While the record loads `editedRecord` is an empty object and `validate()`
	// may flag it invalid, but the Save button only renders past the spinner
	// gate below, so a transient `isValid: false` is never visible.
	const { validity, isValid } = useFormValidity( editedRecord, fields, form );

	if ( ! record ) {
		return (
			<div className="wp-admin-workspaces-app__center">
				<Spinner />
			</div>
		);
	}

	// Form body — the DataForm, any extra children, and the Save button.
	// `className` rides here (not on the Page root) so a panel's `max-width`
	// constrains the form, not the full-width header bar.
	const body = (
		<Stack direction="column" gap="xl" className={ className }>
			{ ! title && heading && (
				<Text variant={ headingVariant } render={ <h2 /> }>
					{ heading }
				</Text>
			) }
			<DataForm
				data={ editedRecord }
				fields={ fields }
				form={ form }
				validity={ validity }
				onChange={ edit }
			/>
			{ children }
			<Stack direction="row" justify="flex-start">
				<Button
					tone="brand"
					variant="solid"
					onClick={ handleSave }
					disabled={ ! hasEdits || ! isValid || isSaving }
					loading={ isSaving }
				>
					{ saveLabel || __( 'Save Changes', 'wp-admin-workspaces' ) }
				</Button>
			</Stack>
		</Stack>
	);

	if ( title ) {
		return (
			<Page title={ title } hasPadding>
				{ body }
			</Page>
		);
	}

	return <div className="wp-admin-workspaces-app--inset">{ body }</div>;
}
