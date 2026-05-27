/**
 * Modal Dialog Block - Frontend Interactivity
 * 
 * Features:
 * - Native <dialog> element for accessibility
 * - Focus trapping and restoration
 * - ESC key to close
 * - Body scroll lock when open
 * - Click outside to close (via ::backdrop)
 */
import { store, getContext, getElement } from '@wordpress/interactivity';

// Track the element that opened the modal for focus restoration
let triggerElement = null;

store('NAMESPACE/modal', {
	actions: {
		open() {
			const context = getContext();
			const { ref } = getElement();
			
			// Store trigger for focus restoration
			triggerElement = ref;
			context.isOpen = true;
		},

		close() {
			const context = getContext();
			context.isOpen = false;
		},

		handleClose() {
			// Fired when dialog closes via ESC or form submission
			const context = getContext();
			context.isOpen = false;
		},

		handleKeydown(event) {
			const context = getContext();
			
			// Close on ESC (dialog handles this natively, but we sync state)
			if (event.key === 'Escape' && context.isOpen) {
				context.isOpen = false;
			}
		},

		confirm() {
			const context = getContext();
			// Handle confirm action here
			console.log('Modal confirmed:', context.modalId);
			context.isOpen = false;
		},
	},

	callbacks: {
		/**
		 * Sync dialog state with native <dialog> element
		 * Runs on mount and when context.isOpen changes
		 */
		syncDialog() {
			const context = getContext();
			const { ref } = getElement();
			
			if (!ref) return;

			if (context.isOpen) {
				// Open as modal (with backdrop, focus trap)
				if (!ref.open) {
					ref.showModal();
				}
				
				// Lock body scroll
				document.body.style.overflow = 'hidden';
				
				// Focus first focusable element
				const focusable = ref.querySelector(
					'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
				);
				focusable?.focus();
			} else {
				// Close dialog
				if (ref.open) {
					ref.close();
				}
				
				// Restore body scroll
				document.body.style.overflow = '';
				
				// Restore focus to trigger
				triggerElement?.focus();
				triggerElement = null;
			}

			// Cleanup function
			return () => {
				document.body.style.overflow = '';
			};
		},
	},
});
