<?php
/**
 * Infinite Scroll Posts Block - Server-side rendering
 * 
 * Demonstrates infinite scroll using the Interactivity Router.
 * New posts are appended as user scrolls without full page reload.
 */

// Get pagination info
$paged = get_query_var('paged') ?: 1;
$posts_per_page = 6;

// Query posts
$query = new WP_Query([
    'posts_per_page' => $posts_per_page,
    'paged' => $paged,
    'post_status' => 'publish',
]);

$total_pages = $query->max_num_pages;
$has_more = $paged < $total_pages;

// Collect posts data for state
$posts_data = [];
if ($query->have_posts()) {
    while ($query->have_posts()) {
        $query->the_post();
        $posts_data[] = [
            'id' => get_the_ID(),
            'title' => get_the_title(),
            'excerpt' => get_the_excerpt(),
            'permalink' => get_the_permalink(),
            'date' => get_the_date(),
            'dateISO' => get_the_date('c'),
        ];
    }
    wp_reset_postdata();
}

// Initialize server state
wp_interactivity_state('myplugin/infinite-scroll', [
    'currentPage' => $paged,
    'totalPages' => $total_pages,
    'hasMore' => $has_more,
    'isLoading' => false,
    'posts' => $posts_data,
]);

// Context for this instance
$context = [
    'nextPageUrl' => $has_more ? get_pagenum_link($paged + 1) : null,
];
?>

<div 
    data-wp-interactive="myplugin/infinite-scroll"
    data-wp-router-region="infinite-scroll-<?php echo esc_attr($block['attrs']['blockId'] ?? 'default'); ?>"
    <?php echo wp_interactivity_data_wp_context($context); ?>
    <?php echo get_block_wrapper_attributes(['class' => 'infinite-scroll-posts']); ?>
>
    <!-- Posts grid -->
    <div class="posts-grid">
        <?php
        // Re-run query for initial render
        $query->rewind_posts();
        if ($query->have_posts()) :
            while ($query->have_posts()) : $query->the_post();
        ?>
            <article class="post-card">
                <h3 class="post-card-title">
                    <a href="<?php the_permalink(); ?>"><?php the_title(); ?></a>
                </h3>
                <div class="post-card-excerpt">
                    <?php the_excerpt(); ?>
                </div>
                <time class="post-card-date" datetime="<?php echo get_the_date('c'); ?>">
                    <?php echo get_the_date(); ?>
                </time>
            </article>
        <?php 
            endwhile;
        else :
        ?>
            <p class="no-posts">No posts found.</p>
        <?php endif; ?>
    </div>

    <!-- Load more trigger -->
    <?php if ($has_more) : ?>
        <div 
            class="load-more-trigger"
            data-wp-init="callbacks.setupObserver"
            data-wp-on--click="actions.loadMore"
            role="button"
            tabindex="0"
            aria-label="Load more posts"
        >
            <!-- Loading state -->
            <div 
                class="loading-indicator"
                data-wp-bind--hidden="!state.isLoading"
                role="status"
                aria-live="polite"
            >
                <span class="screen-reader-text">Loading more posts...</span>
                <div class="spinner" aria-hidden="true"></div>
            </div>

            <!-- Load more button (fallback for no-JS or manual trigger) -->
            <a 
                href="<?php echo esc_url(get_pagenum_link($paged + 1)); ?>"
                class="load-more-button"
                data-wp-bind--hidden="state.isLoading"
                data-wp-on--click="actions.loadMore"
            >
                Load More Posts
            </a>
        </div>
    <?php endif; ?>

    <!-- End of content message -->
    <div 
        class="end-message"
        data-wp-bind--hidden="state.hasMore"
        role="status"
    >
        You've reached the end!
    </div>
</div>

<?php wp_reset_postdata(); ?>

<style>
.infinite-scroll-posts {
    max-width: 1200px;
    margin: 0 auto;
}

.posts-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
    gap: 1.5rem;
    margin-bottom: 2rem;
}

.post-card {
    background: #fff;
    border: 1px solid #e0e0e0;
    border-radius: 8px;
    padding: 1.5rem;
    transition: box-shadow 0.2s, transform 0.2s;
}

.post-card:hover {
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
    transform: translateY(-2px);
}

.post-card-title {
    margin: 0 0 0.75rem;
    font-size: 1.125rem;
    line-height: 1.4;
}

.post-card-title a {
    color: inherit;
    text-decoration: none;
}

.post-card-title a:hover {
    color: #0073aa;
}

.post-card-excerpt {
    color: #666;
    font-size: 0.9375rem;
    margin-bottom: 0.75rem;
    line-height: 1.5;
}

.post-card-date {
    font-size: 0.8125rem;
    color: #999;
}

.load-more-trigger {
    display: flex;
    justify-content: center;
    align-items: center;
    min-height: 80px;
    margin: 2rem 0;
}

.loading-indicator {
    display: flex;
    align-items: center;
    gap: 0.75rem;
}

.spinner {
    width: 24px;
    height: 24px;
    border: 3px solid #e0e0e0;
    border-top-color: #0073aa;
    border-radius: 50%;
    animation: spin 1s linear infinite;
}

@keyframes spin {
    to { transform: rotate(360deg); }
}

.load-more-button {
    display: inline-block;
    padding: 0.75rem 2rem;
    background: #0073aa;
    color: white;
    text-decoration: none;
    border-radius: 4px;
    font-weight: 500;
    transition: background 0.2s;
}

.load-more-button:hover {
    background: #005a87;
    color: white;
}

.end-message {
    text-align: center;
    padding: 2rem;
    color: #666;
    font-style: italic;
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
    
    .post-card {
        transition: none;
    }
}
</style>
