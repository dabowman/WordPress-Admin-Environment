/**
 * Infinite Scroll Posts Block - Client-side interactivity
 * 
 * Uses Intersection Observer to detect when user scrolls near bottom,
 * then uses Interactivity Router to fetch and append more posts.
 */

import { 
    store, 
    getContext, 
    getElement, 
    getServerState,
    getServerContext,
    withSyncEvent 
} from '@wordpress/interactivity';

// Store reference to IntersectionObserver for cleanup
let observer = null;

const { state, actions } = store('myplugin/infinite-scroll', {
    state: {
        currentPage: 1,
        totalPages: 1,
        hasMore: true,
        isLoading: false,
        posts: [],
    },

    actions: {
        /**
         * Load more posts when triggered
         * 
         * Can be triggered by Intersection Observer or manual click
         */
        loadMore: withSyncEvent(function* (event) {
            // Prevent default if it's a click event on the link
            if (event?.preventDefault) {
                event.preventDefault();
            }
            
            // Don't load if already loading or no more posts
            if (state.isLoading || !state.hasMore) {
                return;
            }
            
            const ctx = getContext();
            if (!ctx.nextPageUrl) {
                return;
            }
            
            state.isLoading = true;
            
            try {
                const { actions: routerActions } = yield import('@wordpress/interactivity-router');
                
                // Navigate to next page - router will update the region
                yield routerActions.navigate(ctx.nextPageUrl, {
                    // Don't add to browser history for infinite scroll
                    replace: true,
                    // Disable default loading animation (we have our own)
                    loadingAnimation: false,
                });
                
                // After navigation, sync with server state
                yield actions.syncAfterLoad();
                
            } catch (error) {
                console.error('Failed to load more posts:', error);
                state.hasMore = false; // Stop trying on error
            } finally {
                state.isLoading = false;
            }
        }),

        /**
         * Sync state after loading more content
         */
        *syncAfterLoad() {
            const serverState = getServerState();
            const serverCtx = getServerContext();
            const ctx = getContext();
            
            // Update pagination state
            if (serverState.currentPage !== undefined) {
                state.currentPage = serverState.currentPage;
            }
            if (serverState.totalPages !== undefined) {
                state.totalPages = serverState.totalPages;
            }
            if (serverState.hasMore !== undefined) {
                state.hasMore = serverState.hasMore;
            }
            
            // Update next page URL from server context
            if (serverCtx.nextPageUrl !== undefined) {
                ctx.nextPageUrl = serverCtx.nextPageUrl;
            }
            
            // Merge posts (append new ones)
            if (serverState.posts) {
                const existingIds = new Set(state.posts.map(p => p.id));
                const newPosts = serverState.posts.filter(p => !existingIds.has(p.id));
                state.posts = [...state.posts, ...newPosts];
            }
        },
    },

    callbacks: {
        /**
         * Set up Intersection Observer for automatic loading
         * 
         * Called via data-wp-init on the load-more trigger element
         */
        setupObserver() {
            const { ref } = getElement();
            
            // Clean up any existing observer
            if (observer) {
                observer.disconnect();
            }
            
            // Create new observer
            observer = new IntersectionObserver(
                (entries) => {
                    entries.forEach((entry) => {
                        if (entry.isIntersecting && state.hasMore && !state.isLoading) {
                            // Trigger load when element comes into view
                            actions.loadMore();
                        }
                    });
                },
                {
                    // Start loading when trigger is 200px from viewport
                    rootMargin: '200px',
                    threshold: 0,
                }
            );
            
            // Observe the trigger element
            observer.observe(ref);
            
            // Return cleanup function
            return () => {
                if (observer) {
                    observer.disconnect();
                    observer = null;
                }
            };
        },

        /**
         * Announce new content to screen readers
         */
        announceNewContent() {
            if (!state.isLoading && state.posts.length > 0) {
                const count = state.posts.length;
                const message = `Loaded ${count} posts. ${state.hasMore ? 'Scroll for more.' : 'No more posts.'}`;
                
                // Use WordPress a11y announcer if available
                const announcer = document.getElementById('wp-a11y-speak-polite');
                if (announcer) {
                    announcer.textContent = message;
                }
            }
        },
    },
});

// Handle keyboard activation of load more
document.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
        const target = event.target;
        if (target.classList.contains('load-more-trigger')) {
            event.preventDefault();
            actions.loadMore();
        }
    }
});
