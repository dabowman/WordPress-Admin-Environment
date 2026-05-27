/**
 * Contact Form Block - Frontend Interactivity
 * 
 * Features:
 * - withSyncEvent for form submission
 * - Client-side validation
 * - Server submission with nonce
 * - Error handling
 */
import { store, getContext, withSyncEvent, splitTask } from '@wordpress/interactivity';

const { state } = store('NAMESPACE/contact-form', {
	state: {
		// Derived: check if form is valid
		get isValid() {
			const ctx = getContext();
			return (
				ctx.name.trim() !== '' &&
				ctx.email.trim() !== '' &&
				ctx.message.trim() !== '' &&
				!ctx.errors.name &&
				!ctx.errors.email &&
				!ctx.errors.message
			);
		},
	},

	actions: {
		/**
		 * Update field value on input
		 */
		updateField(event) {
			const ctx = getContext();
			const { name, value } = event.target;
			ctx[name] = value;
			
			// Clear error when user starts typing
			if (ctx.errors[name]) {
				ctx.errors = { ...ctx.errors, [name]: '' };
			}
		},

		/**
		 * Validate field on blur
		 */
		validateField(event) {
			const ctx = getContext();
			const { name, value } = event.target;
			
			const error = validateSingleField(name, value);
			ctx.errors = { ...ctx.errors, [name]: error };
		},

		/**
		 * Handle form submission
		 * Uses withSyncEvent because we need event.preventDefault()
		 */
		handleSubmit: withSyncEvent(function* (event) {
			event.preventDefault();
			
			const ctx = getContext();
			
			// Validate all fields
			const errors = {
				name: validateSingleField('name', ctx.name),
				email: validateSingleField('email', ctx.email),
				message: validateSingleField('message', ctx.message),
			};
			
			ctx.errors = errors;
			
			// Check for any errors
			if (errors.name || errors.email || errors.message) {
				// Focus first error field
				const firstError = Object.keys(errors).find(key => errors[key]);
				if (firstError) {
					const input = event.target.querySelector(`[name="${firstError}"]`);
					input?.focus();
				}
				return;
			}
			
			// Yield to main thread before async work
			yield splitTask();
			
			state.isSubmitting = true;
			
			try {
				const formData = new FormData();
				formData.append('action', 'contact_form_submit');
				formData.append('nonce', state.nonce);
				formData.append('name', ctx.name);
				formData.append('email', ctx.email);
				formData.append('message', ctx.message);
				
				const response = yield fetch(state.ajaxUrl, {
					method: 'POST',
					body: formData,
				});
				
				const result = yield response.json();
				
				if (!result.success) {
					throw new Error(result.data?.message || 'Submission failed');
				}
				
				state.isSubmitted = true;
			} catch (error) {
				console.error('Form submission error:', error);
				
				// Show error to user
				ctx.errors = {
					...ctx.errors,
					message: 'Failed to send message. Please try again.',
				};
			} finally {
				state.isSubmitting = false;
			}
		}),

		/**
		 * Reset form for new submission
		 */
		reset() {
			const ctx = getContext();
			ctx.name = '';
			ctx.email = '';
			ctx.message = '';
			ctx.errors = { name: '', email: '', message: '' };
			state.isSubmitted = false;
		},
	},
});

/**
 * Validate a single field
 * @param {string} name - Field name
 * @param {string} value - Field value
 * @returns {string} Error message or empty string
 */
function validateSingleField(name, value) {
	const trimmed = value.trim();
	
	switch (name) {
		case 'name':
			if (!trimmed) {
				return 'Name is required';
			}
			if (trimmed.length < 2) {
				return 'Name must be at least 2 characters';
			}
			return '';
			
		case 'email':
			if (!trimmed) {
				return 'Email is required';
			}
			// Basic email validation
			const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
			if (!emailRegex.test(trimmed)) {
				return 'Please enter a valid email address';
			}
			return '';
			
		case 'message':
			if (!trimmed) {
				return 'Message is required';
			}
			if (trimmed.length < 10) {
				return 'Message must be at least 10 characters';
			}
			return '';
			
		default:
			return '';
	}
}
