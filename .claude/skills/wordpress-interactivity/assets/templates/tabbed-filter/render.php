<?php
/**
 * Tabbed Filter Posts Block - Server-side rendering
 * 
 * Demonstrates filtering content by category with URL updates.
 * Uses replace: true to avoid cluttering browser history.
 */

// Get current filter from URL
$current_category = isset($_GET['category']) ? sanitize_text_field($_GET['category']) : '';

// Get categories for tabs
$categories = get_categories([
    'hide_empty' => true,
    'number' => 6, // Limit number of tabs
]);

// Build query args
$query_args = [
    'posts_per_page' => 9,
    'post_status' => 'publish',
];

if ($current_category) {
    $query_args['category_name'] = $current_category;
}

$query = new WP_Query($query_args);

// Get current URL for building filter URLs
$base_url = get_permalink();

// Initialize server state
wp_interactivity_state('myplugin/tabbed-filter', [
    'activeCategory' => $current_category,
    'isFiltering' => false,
    'postCount' => $query->found_posts,
]);

// Build context
$context = [
    'baseUrl' => $base_url,
];
?>

<div 
    data-wp-interactive="myplugin/tabbed-filter"
    data-wp-router-region="tabbed-filter-<?php echo esc_attr($block['attrs']['blockId'] ?? 'default'); ?>"
    <?php echo wp_interactivity_data_wp_context($context); ?>
    <?php echo get_block_wrapper_attributes(['class' => 'tabbed-filter']); ?>
>
    <!-- Filter tabs -->
    <nav class="filter-tabs" role="tablist" aria-label="Filter by category">
        <!-- All tab -->
        <a 
            href="<?php echo esc_url($base_url); ?>"
            class="filter-tab <?php echo empty($current_category) ? 'is-active' : ''; ?>"
            role="tab"
            aria-selected="<?php echo empty($current_category) ? 'true' : 'false'; ?>"
            data-wp-on--click="actions.applyFilter"
            data-wp-on-async--mouseenter="actions.prefetchFilter"
            data-wp-class--is-active="!state.activeCategory"
        >
            All
        </a>
        
        <?php foreach ($categories as $category) : 
            $filter_url = add_query_arg('category', $category->slug, $base_url);
            $is_active = $current_category === $category->slug;
        ?>
            <a 
                href="<?php echo esc_url($filter_url); ?>"
                class="filter-tab <?php echo $is_active ? 'is-active' : ''; ?>"
                role="tab"
                aria-selected="<?php echo $is_active ? 'true' : 'false'; ?>"
                data-wp-on--click="actions.applyFilter"
                data-wp-on-async--mouseenter="actions.prefetchFilter"
            >
                <?php echo esc_html($category->name); ?>
                <span class="filter-count">(<?php echo $category->count; ?>)</span>
            </a>
        <?php endforeach; ?>
    </nav>

    <!-- Results info -->
    <div class="results-info" role="status" aria-live="polite">
        <span data-wp-bind--hidden="state.isFiltering">
            Showing <strong data-wp-text="state.postCount"><?php echo $query->found_posts; ?></strong> posts
            <?php if ($current_category) : ?>
                in <strong><?php echo esc_html(get_category_by_slug($current_category)->name ?? $current_category); ?></strong>
            <?php endif; ?>
        </span>
        <span data-wp-bind--hidden="!state.isFiltering">
            Filtering...
        </span>
    </div>

    <!-- Loading overlay -->
    <div 
        class="filter-loading"
        data-wp-bind--hidden="!state.isFiltering"
        aria-hidden="true"
    >
        <div class="loading-bar"></div>
    </div>

    <!-- Posts grid -->
    <div 
        class="posts-grid"
        role="tabpanel"
        data-wp-class--is-loading="state.isFiltering"
    >
        <?php if ($query->have_posts()) : ?>
            <?php while ($query->have_posts()) : $query->the_post(); ?>
                <article class="post-card">
                    <?php if (has_post_thumbnail()) : ?>
                        <div class="post-card-image">
                            <?php the_post_thumbnail('medium'); ?>
                        </div>
                    <?php endif; ?>
                    <div class="post-card-content">
                        <div class="post-card-categories">
                            <?php 
                            $post_categories = get_the_category();
                            foreach ($post_categories as $cat) : ?>
                                <span class="category-badge"><?php echo esc_html($cat->name); ?></span>
                            <?php endforeach; ?>
                        </div>
                        <h3 class="post-card-title">
                            <a href="<?php the_permalink(); ?>"><?php the_title(); ?></a>
                        </h3>
                        <p class="post-card-excerpt">
                            <?php echo wp_trim_words(get_the_excerpt(), 15); ?>
                        </p>
                    </div>
                </article>
            <?php endwhile; ?>
        <?php else : ?>
            <div class="no-results">
                <p>No posts found in this category.</p>
                <a 
                    href="<?php echo esc_url($base_url); ?>"
                    data-wp-on--click="actions.applyFilter"
                >
                    View all posts
                </a>
            </div>
        <?php endif; ?>
    </div>
</div>

<?php wp_reset_postdata(); ?>

<style>
.tabbed-filter {
    max-width: 1200px;
    margin: 0 auto;
}

.filter-tabs {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    margin-bottom: 1.5rem;
    padding-bottom: 1rem;
    border-bottom: 2px solid #e0e0e0;
}

.filter-tab {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    padding: 0.5rem 1rem;
    background: #f5f5f5;
    color: #333;
    text-decoration: none;
    border-radius: 20px;
    font-size: 0.9375rem;
    transition: all 0.2s;
}

.filter-tab:hover {
    background: #e0e0e0;
}

.filter-tab.is-active {
    background: #0073aa;
    color: white;
}

.filter-count {
    font-size: 0.8125rem;
    opacity: 0.7;
}

.results-info {
    margin-bottom: 1rem;
    color: #666;
    font-size: 0.9375rem;
}

.filter-loading {
    position: relative;
    height: 3px;
    background: #e0e0e0;
    margin-bottom: 1rem;
    overflow: hidden;
    border-radius: 2px;
}

.loading-bar {
    position: absolute;
    top: 0;
    left: 0;
    height: 100%;
    width: 30%;
    background: #0073aa;
    animation: loading 1s ease-in-out infinite;
}

@keyframes loading {
    0% { left: -30%; }
    100% { left: 100%; }
}

.posts-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
    gap: 1.5rem;
    transition: opacity 0.2s;
}

.posts-grid.is-loading {
    opacity: 0.5;
    pointer-events: none;
}

.post-card {
    background: #fff;
    border: 1px solid #e0e0e0;
    border-radius: 8px;
    overflow: hidden;
    transition: box-shadow 0.2s;
}

.post-card:hover {
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
}

.post-card-image {
    aspect-ratio: 16 / 9;
    overflow: hidden;
}

.post-card-image img {
    width: 100%;
    height: 100%;
    object-fit: cover;
}

.post-card-content {
    padding: 1rem;
}

.post-card-categories {
    display: flex;
    flex-wrap: wrap;
    gap: 0.25rem;
    margin-bottom: 0.5rem;
}

.category-badge {
    display: inline-block;
    padding: 0.125rem 0.5rem;
    background: #f0f0f0;
    color: #666;
    font-size: 0.75rem;
    border-radius: 4px;
}

.post-card-title {
    margin: 0 0 0.5rem;
    font-size: 1.0625rem;
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
    margin: 0;
    color: #666;
    font-size: 0.875rem;
    line-height: 1.5;
}

.no-results {
    grid-column: 1 / -1;
    text-align: center;
    padding: 3rem;
    background: #f9f9f9;
    border-radius: 8px;
}

.no-results p {
    margin: 0 0 1rem;
    color: #666;
}

.no-results a {
    color: #0073aa;
}

@media (prefers-reduced-motion: reduce) {
    .loading-bar {
        animation: none;
        width: 100%;
    }
    
    .filter-tab,
    .post-card,
    .posts-grid {
        transition: none;
    }
}
</style>
