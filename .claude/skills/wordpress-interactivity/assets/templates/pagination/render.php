<?php
/**
 * Paginated Posts Block - Server-side rendering
 * 
 * Demonstrates client-side pagination using the Interactivity Router.
 * Content updates without full page reload.
 */

// Get pagination info
$paged = get_query_var('paged') ?: 1;
$posts_per_page = 5;

// Query posts
$query = new WP_Query([
    'posts_per_page' => $posts_per_page,
    'paged' => $paged,
    'post_status' => 'publish',
]);

$total_pages = $query->max_num_pages;

// Initialize server state
wp_interactivity_state('myplugin/paginated-posts', [
    'currentPage' => $paged,
    'totalPages' => $total_pages,
    'isNavigating' => false,
]);

// Build context for this instance
$context = [
    'page' => $paged,
];
?>

<div 
    data-wp-interactive="myplugin/paginated-posts"
    data-wp-router-region="posts-pagination-<?php echo esc_attr($block['attrs']['blockId'] ?? 'default'); ?>"
    <?php echo wp_interactivity_data_wp_context($context); ?>
    <?php echo get_block_wrapper_attributes(['class' => 'paginated-posts']); ?>
    data-wp-class--is-loading="state.isNavigating"
    aria-busy="state.isNavigating"
>
    <!-- Loading indicator -->
    <div 
        class="loading-overlay"
        data-wp-bind--hidden="!state.isNavigating"
        role="status"
        aria-live="polite"
    >
        <span class="screen-reader-text">Loading posts...</span>
        <div class="spinner" aria-hidden="true"></div>
    </div>

    <!-- Posts list -->
    <ul class="posts-list">
        <?php if ($query->have_posts()) : ?>
            <?php while ($query->have_posts()) : $query->the_post(); ?>
                <li class="post-item">
                    <article>
                        <h3 class="post-title">
                            <a href="<?php the_permalink(); ?>"><?php the_title(); ?></a>
                        </h3>
                        <div class="post-excerpt">
                            <?php the_excerpt(); ?>
                        </div>
                        <time class="post-date" datetime="<?php echo get_the_date('c'); ?>">
                            <?php echo get_the_date(); ?>
                        </time>
                    </article>
                </li>
            <?php endwhile; ?>
        <?php else : ?>
            <li class="no-posts">No posts found.</li>
        <?php endif; ?>
    </ul>

    <!-- Pagination -->
    <?php if ($total_pages > 1) : ?>
        <nav class="pagination" aria-label="Posts pagination">
            <div class="pagination-info">
                Page <span data-wp-text="state.currentPage"><?php echo $paged; ?></span> 
                of <span data-wp-text="state.totalPages"><?php echo $total_pages; ?></span>
            </div>
            
            <div class="pagination-links">
                <?php if ($paged > 1) : ?>
                    <a 
                        href="<?php echo esc_url(get_pagenum_link($paged - 1)); ?>"
                        class="pagination-prev"
                        data-wp-on--click="actions.navigate"
                        data-wp-on-async--mouseenter="actions.prefetch"
                        aria-label="Go to previous page"
                    >
                        ← Previous
                    </a>
                <?php else : ?>
                    <span class="pagination-prev disabled" aria-disabled="true">← Previous</span>
                <?php endif; ?>

                <?php if ($paged < $total_pages) : ?>
                    <a 
                        href="<?php echo esc_url(get_pagenum_link($paged + 1)); ?>"
                        class="pagination-next"
                        data-wp-on--click="actions.navigate"
                        data-wp-on-async--mouseenter="actions.prefetch"
                        aria-label="Go to next page"
                    >
                        Next →
                    </a>
                <?php else : ?>
                    <span class="pagination-next disabled" aria-disabled="true">Next →</span>
                <?php endif; ?>
            </div>
        </nav>
    <?php endif; ?>
</div>

<?php wp_reset_postdata(); ?>

<style>
.paginated-posts {
    position: relative;
}

.paginated-posts.is-loading {
    opacity: 0.6;
    pointer-events: none;
}

.loading-overlay {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(255, 255, 255, 0.8);
    z-index: 10;
}

.spinner {
    width: 40px;
    height: 40px;
    border: 4px solid #e0e0e0;
    border-top-color: #0073aa;
    border-radius: 50%;
    animation: spin 1s linear infinite;
}

@keyframes spin {
    to { transform: rotate(360deg); }
}

.posts-list {
    list-style: none;
    padding: 0;
    margin: 0 0 2rem;
}

.post-item {
    padding: 1.5rem 0;
    border-bottom: 1px solid #e0e0e0;
}

.post-item:last-child {
    border-bottom: none;
}

.post-title {
    margin: 0 0 0.5rem;
    font-size: 1.25rem;
}

.post-title a {
    color: inherit;
    text-decoration: none;
}

.post-title a:hover {
    color: #0073aa;
}

.post-excerpt {
    color: #666;
    margin-bottom: 0.5rem;
}

.post-date {
    font-size: 0.875rem;
    color: #999;
}

.pagination {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 1rem 0;
    border-top: 1px solid #e0e0e0;
}

.pagination-info {
    color: #666;
}

.pagination-links {
    display: flex;
    gap: 1rem;
}

.pagination-prev,
.pagination-next {
    padding: 0.5rem 1rem;
    background: #0073aa;
    color: white;
    text-decoration: none;
    border-radius: 4px;
    transition: background 0.2s;
}

.pagination-prev:hover,
.pagination-next:hover {
    background: #005a87;
}

.pagination-prev.disabled,
.pagination-next.disabled {
    background: #ccc;
    cursor: not-allowed;
}

.screen-reader-text {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    border: 0;
}

@media (prefers-reduced-motion: reduce) {
    .spinner {
        animation: none;
    }
    
    .paginated-posts.is-loading {
        opacity: 1;
    }
}
</style>
