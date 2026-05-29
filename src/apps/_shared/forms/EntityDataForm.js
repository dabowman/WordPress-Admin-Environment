import '../app.css';
import { DataForm } from '@wordpress/dataviews/wp';
import { useEntityRecord } from '@wordpress/core-data';
import { Button, Stack, Text } from '@wordpress/ui';
import { Spinner } from '@wordpress/components';
import { __ } from '@wordpress/i18n';
import { useEntitySave } from './useEntitySave';

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
 * @param {Object} root0
 * @param {Array}  root0.entity           Entity coords spread into `useEntityRecord` (e.g. `[ 'root', 'site' ]`).
 * @param {Array}  root0.fields           DataForm field definitions.
 * @param {Object} root0.form             DataForm `form` layout config.
 * @param {string} [root0.heading]        Optional `<h2>` heading.
 * @param {string} [root0.headingVariant] WPDS Text variant for the heading.
 * @param {string} [root0.saveLabel]      Save button label.
 * @param {Object} [root0.messages]       `{ success, error }` for the save notices.
 * @param {string} [root0.className]      Wrapper class.
 * @param {Node}   [root0.children]       Extra content rendered between the form and the Save button.
 * @return {JSX.Element} The form shell.
 */
export function EntityDataForm( {
	entity,
	fields,
	form,
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

	if ( ! record ) {
		return (
			<div className="wp-admin-shell-app__center">
				<Spinner />
			</div>
		);
	}

	return (
		<div
			className={ `wp-admin-shell-app--inset${
				className ? ` ${ className }` : ''
			}` }
		>
			<Stack direction="column" gap="xl">
				{ heading && (
					<Text variant={ headingVariant } render={ <h2 /> }>
						{ heading }
					</Text>
				) }
				<DataForm
					data={ editedRecord }
					fields={ fields }
					form={ form }
					onChange={ edit }
				/>
				{ children }
				<Stack direction="row" justify="flex-start">
					<Button
						tone="brand"
						variant="solid"
						onClick={ handleSave }
						disabled={ ! hasEdits || isSaving }
						loading={ isSaving }
					>
						{ saveLabel || __( 'Save Changes', 'wp-admin-shell' ) }
					</Button>
				</Stack>
			</Stack>
		</div>
	);
}
