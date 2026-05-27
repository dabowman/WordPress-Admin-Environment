<?php
/**
 * Modal Overlay Content Block - Server-side rendering
 * 
 * Demonstrates the attachTo feature (WordPress 6.9+) for creating
 * modal content that doesn't exist on every page.
 * 
 * When navigating to a page with this block, the modal region is
 * created and appended to the body, even if the current page
 * doesn't have this region.
 */

// This block renders either a trigger or the modal content
// depending on the context

$is_modal_page = isset($_GET['modal']) && $_GET['modal'] === 'open';

// Initialize server state
wp_interactivity_state('myplugin/modal-overlay', [
    'isOpen' => $is_modal_page,
]);

if ($is_modal_page) {
    // MODAL CONTENT - This renders on the modal page
    // Uses attachTo to append to body when navigating here
    
    $post_id = isset($_GET['post_id']) ? absint($_GET['post_id']) : 0;
    $post = $post_id ? get_post($post_id) : null;
    
    $context = [
        'returnUrl' => wp_get_referer() ?: home_url(),
    ];
    ?>
    
    <!-- Modal region with attachTo - appends to body on navigation -->
    <div 
        data-wp-interactive="myplugin/modal-overlay"
        data-wp-router-region='{"id": "modal-overlay", "attachTo": "body"}'
        <?php echo wp_interactivity_data_wp_context($context); ?>
        class="modal-overlay"
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        data-wp-init="callbacks.onModalOpen"
        data-wp-on--keydown="actions.handleKeydown"
    >
        <!-- Backdrop -->
        <div 
            class="modal-backdrop"
            data-wp-on--click="actions.closeModal"
        ></div>
        
        <!-- Modal content -->
        <div class="modal-container" role="document">
            <header class="modal-header">
                <h2 id="modal-title" class="modal-title">
                    <?php echo $post ? esc_html($post->post_title) : 'Content Details'; ?>
                </h2>
                <button 
                    type="button"
                    class="modal-close"
                    data-wp-on--click="actions.closeModal"
                    aria-label="Close modal"
                >
                    <span aria-hidden="true">&times;</span>
                </button>
            </header>
            
            <div class="modal-body">
                <?php if ($post) : ?>
                    <div class="modal-content">
                        <?php if (has_post_thumbnail($post)) : ?>
                            <div class="modal-image">
                                <?php echo get_the_post_thumbnail($post, 'large'); ?>
                            </div>
                        <?php endif; ?>
                        
                        <div class="modal-text">
                            <?php echo apply_filters('the_content', $post->post_content); ?>
                        </div>
                        
                        <div class="modal-meta">
                            <time datetime="<?php echo get_the_date('c', $post); ?>">
                                Published: <?php echo get_the_date('', $post); ?>
                            </time>
                        </div>
                    </div>
                <?php else : ?>
                    <p>Content not found.</p>
                <?php endif; ?>
            </div>
            
            <footer class="modal-footer">
                <?php if ($post) : ?>
                    <a href="<?php echo get_permalink($post); ?>" class="modal-link">
                        View Full Post →
                    </a>
                <?php endif; ?>
                <button 
                    type="button"
                    class="modal-button"
                    data-wp-on--click="actions.closeModal"
                >
                    Close
                </button>
            </footer>
        </div>
    </div>
    
    <?php
} else {
    // TRIGGER CONTENT - This renders on pages without modal
    // Shows cards that open modal on click
    
    $posts = get_posts([
        'numberposts' => 6,
        'post_status' => 'publish',
    ]);
    
    $context = [
        'currentUrl' => get_permalink(),
    ];
    ?>
    
    <div 
        data-wp-interactive="myplugin/modal-overlay"
        <?php echo wp_interactivity_data_wp_context($context); ?>
        <?php echo get_block_wrapper_attributes(['class' => 'modal-trigger-grid']); ?>
    >
        <h3 class="grid-title">Click a card to open in modal</h3>
        
        <div class="cards-grid">
            <?php foreach ($posts as $post) : 
                $modal_url = add_query_arg([
                    'modal' => 'open',
                    'post_id' => $post->ID,
                ], get_permalink());
            ?>
                <article class="card">
                    <?php if (has_post_thumbnail($post)) : ?>
                        <div class="card-image">
                            <?php echo get_the_post_thumbnail($post, 'medium'); ?>
                        </div>
                    <?php endif; ?>
                    
                    <div class="card-content">
                        <h4 class="card-title"><?php echo esc_html($post->post_title); ?></h4>
                        <p class="card-excerpt">
                            <?php echo wp_trim_words($post->post_excerpt ?: $post->post_content, 10); ?>
                        </p>
                        
                        <a 
                            href="<?php echo esc_url($modal_url); ?>"
                            class="card-link"
                            data-wp-on--click="actions.openModal"
                            data-wp-on-async--mouseenter="actions.prefetchModal"
                            aria-haspopup="dialog"
                        >
                            Quick View
                        </a>
                    </div>
                </article>
            <?php endforeach; ?>
        </div>
    </div>
    
    <?php
}
?>

<style>
/* Grid styles */
.modal-trigger-grid {
    max-width: 1200px;
    margin: 0 auto;
}

.grid-title {
    margin-bottom: 1.5rem;
    font-size: 1.25rem;
}

.cards-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
    gap: 1.5rem;
}

.card {
    background: #fff;
    border: 1px solid #e0e0e0;
    border-radius: 8px;
    overflow: hidden;
    transition: box-shadow 0.2s;
}

.card:hover {
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
}

.card-image {
    aspect-ratio: 16 / 9;
    overflow: hidden;
}

.card-image img {
    width: 100%;
    height: 100%;
    object-fit: cover;
}

.card-content {
    padding: 1rem;
}

.card-title {
    margin: 0 0 0.5rem;
    font-size: 1rem;
}

.card-excerpt {
    margin: 0 0 1rem;
    color: #666;
    font-size: 0.875rem;
}

.card-link {
    display: inline-block;
    padding: 0.5rem 1rem;
    background: #0073aa;
    color: white;
    text-decoration: none;
    border-radius: 4px;
    font-size: 0.875rem;
    transition: background 0.2s;
}

.card-link:hover {
    background: #005a87;
    color: white;
}

/* Modal styles */
.modal-overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    z-index: 100000;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 2rem;
}

.modal-backdrop {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.7);
    animation: fadeIn 0.2s ease-out;
}

.modal-container {
    position: relative;
    width: 100%;
    max-width: 700px;
    max-height: 90vh;
    background: white;
    border-radius: 8px;
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
    display: flex;
    flex-direction: column;
    animation: slideIn 0.3s ease-out;
}

@keyframes fadeIn {
    from { opacity: 0; }
    to { opacity: 1; }
}

@keyframes slideIn {
    from { 
        opacity: 0;
        transform: translateY(-20px);
    }
    to { 
        opacity: 1;
        transform: translateY(0);
    }
}

.modal-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 1rem 1.5rem;
    border-bottom: 1px solid #e0e0e0;
}

.modal-title {
    margin: 0;
    font-size: 1.25rem;
}

.modal-close {
    background: none;
    border: none;
    font-size: 2rem;
    line-height: 1;
    cursor: pointer;
    color: #666;
    padding: 0;
    width: 40px;
    height: 40px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 4px;
    transition: background 0.2s;
}

.modal-close:hover {
    background: #f0f0f0;
}

.modal-body {
    flex: 1;
    overflow-y: auto;
    padding: 1.5rem;
}

.modal-image {
    margin-bottom: 1.5rem;
    border-radius: 4px;
    overflow: hidden;
}

.modal-image img {
    width: 100%;
    height: auto;
}

.modal-text {
    line-height: 1.7;
}

.modal-meta {
    margin-top: 1.5rem;
    padding-top: 1rem;
    border-top: 1px solid #e0e0e0;
    font-size: 0.875rem;
    color: #666;
}

.modal-footer {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 1rem 1.5rem;
    border-top: 1px solid #e0e0e0;
}

.modal-link {
    color: #0073aa;
    text-decoration: none;
}

.modal-link:hover {
    text-decoration: underline;
}

.modal-button {
    padding: 0.5rem 1.5rem;
    background: #f0f0f0;
    border: 1px solid #ccc;
    border-radius: 4px;
    cursor: pointer;
    font-size: 0.9375rem;
    transition: background 0.2s;
}

.modal-button:hover {
    background: #e0e0e0;
}

@media (prefers-reduced-motion: reduce) {
    .modal-backdrop,
    .modal-container {
        animation: none;
    }
}
</style>
