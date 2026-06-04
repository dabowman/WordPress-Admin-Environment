import { RangeControl } from '@wordpress/components';
import { clampRange, rangeDisplayValue } from './rangeControl.mjs';

/**
 * Range/slider DataForm `Edit` control — the missing `FORM_CONTROLS` entry
 * (parity doc §2.13 / roadmap group C item 8). DataForm ships `number`/`integer`
 * controls that render a bare numeric input; this wraps `@wordpress/components`
 * `RangeControl` to give a slider **with** an adjacent number input
 * (`withInputField` is on by default), so precise pixel entry is preserved while
 * adding drag-to-set.
 *
 * `@wordpress/ui` 0.12 has no slider component, so this stays on
 * `@wordpress/components` `RangeControl` (the documented per-component fallback).
 *
 * Bounds (`min`/`max`/`step`/`marks`) are closed over by `makeRangeControl`
 * rather than read off the field def, because DataViews' field normalization
 * does not guarantee arbitrary extra keys survive onto the `Edit`-passed field.
 *
 * @param {Object}  opts                   Range bounds + presentation.
 * @param {number}  [opts.min=0]           Lower bound.
 * @param {number}  [opts.max=100]         Upper bound.
 * @param {number}  [opts.step=1]          Step increment.
 * @param {Array}   [opts.marks]           `RangeControl` marks.
 * @param {boolean} [opts.allowReset=true] Show the reset affordance.
 * @return {Function} A DataForm `Edit` component.
 */
export function makeRangeControl( {
	min = 0,
	max = 100,
	step = 1,
	marks,
	allowReset = true,
} = {} ) {
	/**
	 * @param {Object}   root0                       DataForm control props.
	 * @param {Object}   root0.data                  The form's working record.
	 * @param {Object}   root0.field                 The normalized field def.
	 * @param {Function} root0.onChange              Commit a partial-record change.
	 * @param {boolean}  [root0.hideLabelFromVision] Visually hide the label.
	 * @return {JSX.Element} The slider control.
	 */
	function RangeFormControl( {
		data,
		field,
		onChange,
		hideLabelFromVision,
	} ) {
		const current = field.getValue
			? field.getValue( { item: data } )
			: data[ field.id ];

		const commit = ( next ) => {
			const clamped =
				next === undefined
					? undefined
					: clampRange( next, { min, max } );
			onChange(
				field.setValue
					? field.setValue( { item: data, value: clamped } )
					: { [ field.id ]: clamped }
			);
		};

		return (
			<RangeControl
				__nextHasNoMarginBottom
				__next40pxDefaultSize
				label={ field.label }
				hideLabelFromVision={ hideLabelFromVision }
				value={ rangeDisplayValue( current ) }
				min={ min }
				max={ max }
				step={ step }
				marks={ marks }
				allowReset={ allowReset }
				onChange={ commit }
			/>
		);
	}

	return RangeFormControl;
}

/**
 * Convenience: build a complete DataForm field def backed by the slider. The
 * `setValue` clamps into `[min, max]` (and rounds for integer fields) so a value
 * driven past the bounds — or cleared via reset — can never write out of range.
 *
 * @param {Object}  spec                Field spec.
 * @param {string}  spec.id             Field / option id.
 * @param {string}  spec.label          Visible label.
 * @param {number}  [spec.min=0]        Lower bound.
 * @param {number}  [spec.max=100]      Upper bound.
 * @param {number}  [spec.step=1]       Step increment.
 * @param {Array}   [spec.marks]        `RangeControl` marks.
 * @param {boolean} [spec.integer=true] Coerce the stored value to an integer.
 * @return {Object} A DataForm field definition.
 */
export function rangeField( {
	id,
	label,
	min = 0,
	max = 100,
	step = 1,
	marks,
	integer = true,
	...rest
} ) {
	return {
		id,
		label,
		type: integer ? 'integer' : 'number',
		Edit: makeRangeControl( { min, max, step, marks } ),
		setValue: ( { value } ) => {
			const clamped = clampRange( value, { min, max } );
			return { [ id ]: integer ? Math.round( clamped ) : clamped };
		},
		...rest,
	};
}
