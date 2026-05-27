<?php
/**
 * Contact Form Block - Server-side render
 *
 * @var array    $attributes Block attributes.
 * @var string   $content    Inner block content.
 * @var WP_Block $block      Block instance.
 */

$success_message = $attributes['successMessage'] ?? 'Thank you! Your message has been sent.';

// Initialize global state
wp_interactivity_state(
	'NAMESPACE/contact-form',
	array(
		'isSubmitting'   => false,
		'isSubmitted'    => false,
		'successMessage' => $success_message,
		'ajaxUrl'        => admin_url( 'admin-ajax.php' ),
		'nonce'          => wp_create_nonce( 'contact_form_nonce' ),
	)
);

// Context for this form instance
$context = array(
	'name'    => '',
	'email'   => '',
	'message' => '',
	'errors'  => array(
		'name'    => '',
		'email'   => '',
		'message' => '',
	),
);
?>

<div
	data-wp-interactive="NAMESPACE/contact-form"
	<?php echo wp_interactivity_data_wp_context( $context ); ?>
	<?php echo get_block_wrapper_attributes( array( 'class' => 'wp-block-contact-form' ) ); ?>
>
	<!-- Success Message -->
	<div
		class="wp-block-contact-form__success"
		data-wp-bind--hidden="!state.isSubmitted"
		role="alert"
	>
		<p data-wp-text="state.successMessage"></p>
		<button
			type="button"
			class="wp-block-contact-form__reset"
			data-wp-on-async--click="actions.reset"
		>
			Send another message
		</button>
	</div>

	<!-- Form -->
	<form
		class="wp-block-contact-form__form"
		data-wp-bind--hidden="state.isSubmitted"
		data-wp-on--submit="actions.handleSubmit"
		novalidate
	>
		<!-- Name Field -->
		<div class="wp-block-contact-form__field">
			<label for="contact-name" class="wp-block-contact-form__label">
				Name <span aria-hidden="true">*</span>
			</label>
			<input
				type="text"
				id="contact-name"
				name="name"
				class="wp-block-contact-form__input"
				data-wp-on--input="actions.updateField"
				data-wp-on--blur="actions.validateField"
				data-wp-bind--value="context.name"
				data-wp-bind--aria-invalid="context.errors.name ? 'true' : 'false'"
				data-wp-bind--aria-describedby="context.errors.name ? 'name-error' : null"
				data-wp-class--has-error="context.errors.name"
				required
			/>
			<span
				id="name-error"
				class="wp-block-contact-form__error"
				data-wp-bind--hidden="!context.errors.name"
				data-wp-text="context.errors.name"
				role="alert"
			></span>
		</div>

		<!-- Email Field -->
		<div class="wp-block-contact-form__field">
			<label for="contact-email" class="wp-block-contact-form__label">
				Email <span aria-hidden="true">*</span>
			</label>
			<input
				type="email"
				id="contact-email"
				name="email"
				class="wp-block-contact-form__input"
				data-wp-on--input="actions.updateField"
				data-wp-on--blur="actions.validateField"
				data-wp-bind--value="context.email"
				data-wp-bind--aria-invalid="context.errors.email ? 'true' : 'false'"
				data-wp-bind--aria-describedby="context.errors.email ? 'email-error' : null"
				data-wp-class--has-error="context.errors.email"
				required
			/>
			<span
				id="email-error"
				class="wp-block-contact-form__error"
				data-wp-bind--hidden="!context.errors.email"
				data-wp-text="context.errors.email"
				role="alert"
			></span>
		</div>

		<!-- Message Field -->
		<div class="wp-block-contact-form__field">
			<label for="contact-message" class="wp-block-contact-form__label">
				Message <span aria-hidden="true">*</span>
			</label>
			<textarea
				id="contact-message"
				name="message"
				class="wp-block-contact-form__textarea"
				rows="5"
				data-wp-on--input="actions.updateField"
				data-wp-on--blur="actions.validateField"
				data-wp-bind--aria-invalid="context.errors.message ? 'true' : 'false'"
				data-wp-bind--aria-describedby="context.errors.message ? 'message-error' : null"
				data-wp-class--has-error="context.errors.message"
				required
			></textarea>
			<span
				id="message-error"
				class="wp-block-contact-form__error"
				data-wp-bind--hidden="!context.errors.message"
				data-wp-text="context.errors.message"
				role="alert"
			></span>
		</div>

		<!-- Submit Button -->
		<button
			type="submit"
			class="wp-block-contact-form__submit"
			data-wp-bind--disabled="state.isSubmitting"
			data-wp-class--is-loading="state.isSubmitting"
		>
			<span data-wp-text="state.isSubmitting ? 'Sending...' : 'Send Message'"></span>
		</button>
	</form>
</div>
