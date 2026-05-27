/**
 * Paginated Posts Block - Client-side interactivity
 * 
 * Handles client-side navigation for pagination.
 * Uses @wordpress/interactivity-router for seamless page transitions.
 */

import { store, getElement, withSyncEvent } from '@wordpress/interactivity';

const { state } = store('myplugin/paginated-posts', {
    state: {
        currentPage: 1,
        totalPages: 1,
        isNavigating: false,
    },

    actions: {
        /**
         * Navigate to a new page without full reload
         * 
         * Uses withSyncEvent to access event.preventDefault()
         * Uses generator function for proper async handling
         */
        navigate: withSyncEvent(function* (event) {
            event.preventDefault();
            
            // Set loading state
            state.isNavigating = true;
            
            try {
                // Dynamically import the router to reduce initial bundle
                const { actions } = yield import('@wordpress/interactivity-router');
                
                // Navigate to the new page
                yield actions.navigate(event.target.href);
                
                // Scroll to top of the block after navigation
                const { ref } = getElement();
                ref.scrollIntoView({ behavior: 'smooth', block: 'start' });
                
            } catch (error) {
                console.error('Navigation failed:', error);
                
                // Fallback to full page navigation on error
                window.location.href = event.target.href;
            } finally {
                state.isNavigating = false;
            }
        }),

        /**
         * Prefetch page on hover for instant navigation
         * 
         * Uses async function (not generator) since we don't need
         * to access synchronous event properties
         */
        prefetch: async () => {
            const { ref } = getElement();
            const href = ref.href;
            
            if (!href) return;
            
            try {
                const { actions } = await import('@wordpress/interactivity-router');
                actions.prefetch(href);
            } catch (error) {
                // Prefetch failure is non-critical
                console.warn('Prefetch failed:', error);
            }
        },
    },

    callbacks: {
        /**
         * Sync state with server after navigation
         * 
         * Called via data-wp-watch when navigation completes
         */
        syncState() {
            const { getServerState } = require('@wordpress/interactivity');
            const serverState = getServerState();
            
            if (serverState.currentPage !== undefined) {
                state.currentPage = serverState.currentPage;
            }
            if (serverState.totalPages !== undefined) {
                state.totalPages = serverState.totalPages;
            }
        },
    },
});
