/**
 * Posts List with Client Navigation - Frontend Interactivity
 * 
 * Demonstrates:
 * - Client-side navigation using @wordpress/interactivity-router
 * - Prefetching for instant page loads
 * - Loading states during navigation
 * - Scroll restoration
 */
import { store, getElement, withSyncEvent } from '@wordpress/interactivity';

const { state } = store('NAMESPACE/posts-list', {
	state: {
		// Derived: check if on first page
		get isFirstPage() {
			return state.currentPage === 1;
		},
		
		// Derived: check if on last page
		get isLastPage() {
			return state.currentPage >= state.totalPages;
		},
	},

	actions: {
		/**
		 * Navigate to a new page without full reload
		 * Uses withSyncEvent because we need event.preventDefault()
		 */
		navigate: withSyncEvent(function* (event) {
			event.preventDefault();
			
			const { ref } = getElement();
			const href = ref.href;
			
			if (!href) return;
			
			state.isNavigating = true;
			
			try {
				// Dynamically import the router
				const { actions } = yield import('@wordpress/interactivity-router');
				
				// Perform client-side navigation
				yield actions.navigate(href);
				
				// Scroll to top of posts list
				const container = document.querySelector('.wp-block-posts-list');
				if (container) {
					container.scrollIntoView({ behavior: 'smooth', block: 'start' });
				}
			} catch (error) {
				console.error('Navigation failed:', error);
				// Fallback to traditional navigation
				window.location.href = href;
			} finally {
				state.isNavigating = false;
			}
		}),

		/**
		 * Prefetch page for instant navigation
		 * Called on mouseenter for pagination links
		 */
		prefetch: async () => {
			const { ref } = getElement();
			const href = ref?.href;
			
			if (!href) return;
			
			try {
				const { actions } = await import('@wordpress/interactivity-router');
				actions.prefetch(href);
			} catch (error) {
				// Prefetch failed silently - navigation will still work
				console.debug('Prefetch failed:', error);
			}
		},
	},
});

// Import getElement for actions
import { getElement } from '@wordpress/interactivity';
