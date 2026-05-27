import { __ } from '@wordpress/i18n';
import { useBlockProps, RichText, InspectorControls } from '@wordpress/block-editor';
import { PanelBody, ToggleControl } from '@wordpress/components';
import type { BlockEditProps } from '@wordpress/blocks';
import './editor.scss';

interface Attributes {
	content: string;
}

export default function Edit({ attributes, setAttributes }: BlockEditProps<Attributes>) {
	const blockProps = useBlockProps();

	return (
		<>
			<InspectorControls>
				<PanelBody title={__('Settings', 'namespace')}>
					{/* Add custom controls here */}
				</PanelBody>
			</InspectorControls>

			<div {...blockProps}>
				<RichText
					tagName="p"
					value={attributes.content}
					onChange={(content) => setAttributes({ content })}
					placeholder={__('Enter content...', 'namespace')}
				/>
			</div>
		</>
	);
}
