/**
 * Modal Overlay Content Block - Client-side interactivity
 * 
 * Demonstrates the attachTo feature for dynamic region creation.
 * When navigating to a page with the modal region, it's created
 * and appended to the body even if the current page doesn't have it.
 * 
 * Requires WordPress 6.9+
 */

import { 
    store, 
    getContext, 
    getElement,
    withSyncEvent 
} from '@wordpress/interactivity';

// Track last focused element for focus restoration
let lastFocusedElement = null;

const { state, actions } = store('myplugin/modal-overlay', {
    state: {
        isOpen: false,
    },

    actions: {
        /**
         * Open modal by navigating to modal URL
         * 
         * The router's attachTo feature creates the modal region
         * even though it doesn't exist on the current page.
         */
        openModal: withSyncEvent(function* (event) {
            event.preventDefault();
            
            const href = event.target.closest('a')?.href;
            if (!href) return;
            
            // Store focus for restoration when closing
            lastFocusedElement = document.activeElement;
            
            try {
                const { actions: routerActions } = yield import('@wordpress/interactivity-router');
                
                // Navigate to modal URL
                // The modal region uses attachTo: "body" so it will be
                // created and appended even though current page lacks it
                yield routerActions.navigate(href, {
                    // Don't replace - user should be able to go back
                    replace: false,
                });
                
                state.isOpen = true;
                
            } catch (error) {
                console.error('Failed to open modal:', error);
                // Fallback to full navigation
                window.location.href = href;
            }
        }),

        /**
         * Close modal and return to previous page
         */
        closeModal: withSyncEvent(function* (event) {
            if (event?.preventDefault) {
                event.preventDefault();
            }
            
            const ctx = getContext();
            
            try {
                const { actions: routerActions } = yield import('@wordpress/interactivity-router');
                
                // Navigate back to return URL
                yield routerActions.navigate(ctx.returnUrl || '/', {
                    replace: false,
                });
                
                state.isOpen = false;
                
                // Restore focus
                if (lastFocusedElement && document.body.contains(lastFocusedElement)) {
                    lastFocusedElement.focus();
                }
                
            } catch (error) {
                console.error('Failed to close modal:', error);
                // Use browser back as fallback
                window.history.back();
            }
        }),

        /**
         * Prefetch modal content on hover
         */
        prefetchModal: async () => {
            const { ref } = getElement();
            const href = ref.closest('a')?.href;
            
            if (!href) return;
            
            try {
                const { actions: routerActions } = await import('@wordpress/interactivity-router');
                routerActions.prefetch(href);
            } catch (error) {
                // Non-critical
            }
        },

        /**
         * Handle keyboard events in modal
         */
        handleKeydown: withSyncEvent(function* (event) {
            // Close on Escape
            if (event.key === 'Escape') {
                yield actions.closeModal(event);
                return;
            }
            
            // Trap focus within modal
            if (event.key === 'Tab') {
                const { ref } = getElement();
                const focusableElements = ref.querySelectorAll(
                    'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
                );
                
                const firstFocusable = focusableElements[0];
                const lastFocusable = focusableElements[focusableElements.length - 1];
                
                if (event.shiftKey) {
                    // Shift + Tab
                    if (document.activeElement === firstFocusable) {
                        event.preventDefault();
                        lastFocusable?.focus();
                    }
                } else {
                    // Tab
                    if (document.activeElement === lastFocusable) {
                        event.preventDefault();
                        firstFocusable?.focus();
                    }
                }
            }
        }),
    },

    callbacks: {
        /**
         * Called when modal opens
         * Sets up accessibility features
         */
        onModalOpen() {
            const { ref } = getElement();
            
            // Prevent body scroll
            document.body.style.overflow = 'hidden';
            
            // Focus first focusable element in modal
            const firstFocusable = ref.querySelector(
                'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
            );
            
            // Small delay to ensure DOM is ready
            setTimeout(() => {
                if (firstFocusable) {
                    firstFocusable.focus();
                }
            }, 100);
            
            // Announce modal to screen readers
            const title = ref.querySelector('.modal-title')?.textContent;
            if (title) {
                const announcer = document.getElementById('wp-a11y-speak-assertive');
                if (announcer) {
                    announcer.textContent = `Modal opened: ${title}`;
                }
            }
            
            // Return cleanup function
            return () => {
                document.body.style.overflow = '';
            };
        },
    },
});

// Handle browser back button
window.addEventListener('popstate', () => {
    // If we're navigating away from modal, update state
    const isModalUrl = new URL(window.location.href).searchParams.get('modal') === 'open';
    
    if (!isModalUrl && state.isOpen) {
        state.isOpen = false;
        document.body.style.overflow = '';
        
        if (lastFocusedElement && document.body.contains(lastFocusedElement)) {
            lastFocusedElement.focus();
        }
    }
});
