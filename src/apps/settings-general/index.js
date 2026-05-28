/* eslint-disable @wordpress/no-unsafe-wp-apis -- __experimentalDivider has no @wordpress/ui 0.12 port. */
import './index.css';
import '../_shared/app.css';
import { useState, useEffect, useRef } from '@wordpress/element';
import { useEntityRecord } from '@wordpress/core-data';
import { Button, InputControl, Notice, Stack, Text } from '@wordpress/ui';
import {
	SelectControl,
	CheckboxControl,
	RadioControl,
	Spinner,
	__experimentalDivider as Divider,
} from '@wordpress/components';
import { __ } from '@wordpress/i18n';
import { eventValue } from '../_shared/forms/eventValue.mjs';
import { useEntitySave } from '../_shared/forms/useEntitySave';

const CUSTOM_RADIO_VALUE = '__custom__';

export default function SettingsGeneralApp() {
	const data = window.wpAdminShell?.settingsGeneral;
	const { record, editedRecord, edit, save, hasEdits, isSaving } =
		useEntityRecord( 'root', 'site' );

	const handleSave = useEntitySave( save, {
		success: __( 'Settings saved.', 'wp-admin-shell' ),
		error: __( 'Failed to save settings.', 'wp-admin-shell' ),
	} );
	const [ dateFormatCustom, setDateFormatCustom ] = useState(
		editedRecord?.date_format || ''
	);
	const [ timeFormatCustom, setTimeFormatCustom ] = useState(
		editedRecord?.time_format || ''
	);

	// `editedRecord` is null on first render (the Spinner returns before the
	// record resolves), so the `useState` seeds above latch to ''. Re-sync the
	// custom-format memory from the resolved record once, so a site already on
	// a non-preset format keeps it when the user toggles preset → Custom
	// instead of silently writing the 'Y-m-d'/'H:i' fallback.
	const formatInitRef = useRef( false );
	useEffect( () => {
		if ( formatInitRef.current || ! record || ! data ) {
			return;
		}
		formatInitRef.current = true;
		const datePresets = data.dateFormats.map( ( o ) => o.value );
		const timePresets = data.timeFormats.map( ( o ) => o.value );
		if (
			record.date_format &&
			! datePresets.includes( record.date_format )
		) {
			setDateFormatCustom( record.date_format );
		}
		if (
			record.time_format &&
			! timePresets.includes( record.time_format )
		) {
			setTimeFormatCustom( record.time_format );
		}
	}, [ record, data ] );

	const isMultisite = !! data?.isMultisite;

	if ( ! record || ! data ) {
		return (
			<div className="wp-admin-shell-app__center">
				<Spinner />
			</div>
		);
	}

	const dateFormatPresetValues = data.dateFormats.map( ( o ) => o.value );
	const timeFormatPresetValues = data.timeFormats.map( ( o ) => o.value );

	const dateFormatRadioValue = dateFormatPresetValues.includes(
		editedRecord.date_format
	)
		? editedRecord.date_format
		: CUSTOM_RADIO_VALUE;
	const timeFormatRadioValue = timeFormatPresetValues.includes(
		editedRecord.time_format
	)
		? editedRecord.time_format
		: CUSTOM_RADIO_VALUE;

	const dateFormatOptions = [
		...data.dateFormats.map( ( o ) => ( {
			value: o.value,
			label: `${ o.label } — ${ o.value }`,
		} ) ),
		{
			value: CUSTOM_RADIO_VALUE,
			label: __( 'Custom', 'wp-admin-shell' ),
		},
	];
	const timeFormatOptions = [
		...data.timeFormats.map( ( o ) => ( {
			value: o.value,
			label: `${ o.label } — ${ o.value }`,
		} ) ),
		{
			value: CUSTOM_RADIO_VALUE,
			label: __( 'Custom', 'wp-admin-shell' ),
		},
	];

	return (
		<div className="wp-admin-shell-app-settings-general">
			<Stack direction="column" gap="xl">
				<Text variant="heading-xl" render={ <h2 /> }>
					{ __( 'General Settings', 'wp-admin-shell' ) }
				</Text>

				{ /* Site identity */ }
				<InputControl
					label={ __( 'Site Title', 'wp-admin-shell' ) }
					value={ editedRecord.title || '' }
					onChange={ ( e ) => edit( { title: eventValue( e ) } ) }
				/>
				<InputControl
					label={ __( 'Tagline', 'wp-admin-shell' ) }
					description={ __(
						'In a few words, explain what this site is about.',
						'wp-admin-shell'
					) }
					value={ editedRecord.description || '' }
					onChange={ ( e ) =>
						edit( { description: eventValue( e ) } )
					}
				/>

				{ ! isMultisite && (
					<>
						<InputControl
							label={ __(
								'WordPress Address (URL)',
								'wp-admin-shell'
							) }
							type="url"
							value={ editedRecord.url || '' }
							onChange={ ( e ) =>
								edit( { url: eventValue( e ) } )
							}
							disabled={ data.siteurlConst }
							description={
								data.siteurlConst
									? __(
											'Defined by WP_SITEURL constant.',
											'wp-admin-shell'
									  )
									: undefined
							}
						/>
						<InputControl
							label={ __(
								'Site Address (URL)',
								'wp-admin-shell'
							) }
							type="url"
							value={ editedRecord.home || '' }
							onChange={ ( e ) =>
								edit( { home: eventValue( e ) } )
							}
							disabled={ data.homeConst }
							description={
								data.homeConst
									? __(
											'Defined by WP_HOME constant.',
											'wp-admin-shell'
									  )
									: __(
											'Enter the same as the WordPress Address unless your home page lives elsewhere.',
											'wp-admin-shell'
									  )
							}
						/>
					</>
				) }

				{ ! isMultisite && (
					<>
						<InputControl
							label={ __(
								'Administration Email Address',
								'wp-admin-shell'
							) }
							type="email"
							value={ editedRecord.email || '' }
							onChange={ ( e ) =>
								edit( { email: eventValue( e ) } )
							}
							description={ __(
								'Used for admin purposes. Note: REST API saves this directly without the email-confirmation step that wp-admin uses.',
								'wp-admin-shell'
							) }
						/>
						{ data.pendingAdminEmail &&
							data.pendingAdminEmail !== record.email && (
								<Notice.Root intent="info">
									<Notice.Description>
										{ __(
											'There is a pending admin email change to:',
											'wp-admin-shell'
										) }
										<code>{ data.pendingAdminEmail }</code>
									</Notice.Description>
								</Notice.Root>
							) }
					</>
				) }

				{ /* Membership */ }
				{ ! isMultisite && (
					<>
						<Divider />
						<Text variant="heading-lg" render={ <h3 /> }>
							{ __( 'Membership', 'wp-admin-shell' ) }
						</Text>
						<CheckboxControl
							label={ __(
								'Anyone can register',
								'wp-admin-shell'
							) }
							checked={ !! editedRecord.users_can_register }
							onChange={ ( val ) =>
								edit( { users_can_register: val } )
							}
							__nextHasNoMarginBottom
						/>
						<SelectControl
							label={ __(
								'New User Default Role',
								'wp-admin-shell'
							) }
							value={ editedRecord.default_role || 'subscriber' }
							options={ data.roles }
							onChange={ ( val ) =>
								edit( { default_role: val } )
							}
							__nextHasNoMarginBottom
						/>
					</>
				) }

				<Divider />

				{ /* Language — keeps SelectControl from @wordpress/components for native optgroup support */ }
				<SelectControl
					label={ __( 'Site Language', 'wp-admin-shell' ) }
					value={ editedRecord.language || '' }
					onChange={ ( val ) => edit( { language: val } ) }
					__nextHasNoMarginBottom
				>
					{ data.languages.default.map( ( o ) => (
						<option key={ o.value } value={ o.value }>
							{ o.label }
						</option>
					) ) }
					{ data.languages.installed.length > 0 && (
						<optgroup label={ __( 'Installed', 'wp-admin-shell' ) }>
							{ data.languages.installed.map( ( o ) => (
								<option key={ o.value } value={ o.value }>
									{ o.label }
								</option>
							) ) }
						</optgroup>
					) }
					{ data.languages.available.length > 0 && (
						<optgroup label={ __( 'Available', 'wp-admin-shell' ) }>
							{ data.languages.available.map( ( o ) => (
								<option key={ o.value } value={ o.value }>
									{ o.label }
								</option>
							) ) }
						</optgroup>
					) }
				</SelectControl>

				{ /* Timezone */ }
				<SelectControl
					label={ __( 'Timezone', 'wp-admin-shell' ) }
					value={ editedRecord.timezone || data.timezone.current }
					onChange={ ( val ) => edit( { timezone: val } ) }
					help={ __(
						'Choose either a city in the same timezone as you or a UTC offset.',
						'wp-admin-shell'
					) }
					__nextHasNoMarginBottom
				>
					{ data.timezone.groups.map( ( group ) => (
						<optgroup key={ group.label } label={ group.label }>
							{ group.options.map( ( o ) => (
								<option key={ o.value } value={ o.value }>
									{ o.label }
								</option>
							) ) }
						</optgroup>
					) ) }
				</SelectControl>
				<Text variant="body-sm">
					{ __( 'Universal time:', 'wp-admin-shell' ) }{ ' ' }
					<code>{ data.timezone.utcNow }</code>
					{ ' · ' }
					{ __( 'Local time:', 'wp-admin-shell' ) }{ ' ' }
					<code>{ data.timezone.localNow }</code>
				</Text>

				<Divider />

				{ /* Date format */ }
				<RadioControl
					label={ __( 'Date Format', 'wp-admin-shell' ) }
					selected={ dateFormatRadioValue }
					options={ dateFormatOptions }
					onChange={ ( val ) => {
						if ( val === CUSTOM_RADIO_VALUE ) {
							edit( {
								date_format: dateFormatCustom || 'Y-m-d',
							} );
						} else {
							edit( { date_format: val } );
						}
					} }
				/>
				{ dateFormatRadioValue === CUSTOM_RADIO_VALUE && (
					<InputControl
						label={ __( 'Custom date format', 'wp-admin-shell' ) }
						value={ editedRecord.date_format || '' }
						onChange={ ( e ) => {
							const v = eventValue( e );
							setDateFormatCustom( v );
							edit( { date_format: v } );
						} }
					/>
				) }

				{ /* Time format */ }
				<RadioControl
					label={ __( 'Time Format', 'wp-admin-shell' ) }
					selected={ timeFormatRadioValue }
					options={ timeFormatOptions }
					onChange={ ( val ) => {
						if ( val === CUSTOM_RADIO_VALUE ) {
							edit( {
								time_format: timeFormatCustom || 'H:i',
							} );
						} else {
							edit( { time_format: val } );
						}
					} }
				/>
				{ timeFormatRadioValue === CUSTOM_RADIO_VALUE && (
					<InputControl
						label={ __( 'Custom time format', 'wp-admin-shell' ) }
						value={ editedRecord.time_format || '' }
						onChange={ ( e ) => {
							const v = eventValue( e );
							setTimeFormatCustom( v );
							edit( { time_format: v } );
						} }
					/>
				) }

				{ /* Week starts on */ }
				<SelectControl
					label={ __( 'Week Starts On', 'wp-admin-shell' ) }
					value={ String( editedRecord.start_of_week ?? 1 ) }
					options={ data.weekdays }
					onChange={ ( val ) =>
						edit( { start_of_week: parseInt( val, 10 ) } )
					}
					__nextHasNoMarginBottom
				/>

				<Stack direction="row" justify="flex-start">
					<Button
						tone="brand"
						variant="solid"
						onClick={ handleSave }
						disabled={ ! hasEdits || isSaving }
						loading={ isSaving }
					>
						{ __( 'Save Changes', 'wp-admin-shell' ) }
					</Button>
				</Stack>
			</Stack>
		</div>
	);
}
