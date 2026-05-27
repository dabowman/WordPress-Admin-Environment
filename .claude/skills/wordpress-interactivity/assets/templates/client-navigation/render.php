<?php
/**
 * Posts List with Client Navigation - Server-side render
 * 
 * Demonstrates client-side navigation with router regions.
 * Pages load without full refresh while updating the posts list.
 */

$posts_per_page = $attributes['postsPerPage'] ?? 10;
$post_type      = $attributes['postType'] ?? 'post';

// Get current page from query
$current_page = max( 1, get_query_var( 'paged', 1 ) );

// Query posts
$query = new WP_Query(
	array(
		'post_type'      => $post_type,
		'posts_per_page' => $posts_per_page,
		'paged'          => $current_page,
	)
);

$total_pages = $query->max_num_pages;

// Initialize state
wp_interactivity_state(
	'NAMESPACE/posts-list',
	array(
		'currentPage' => $current_page,
		'totalPages'  => $total_pages,
		'isNavigating' => false,
	)
);
?>

<div
	data-wp-interactive="NAMESPACE/posts-list"
	<?php echo get_block_wrapper_attributes( array( 'class' => 'wp-block-posts-list' ) ); ?>
>
	<!-- Loading indicator -->
	<div
		class="wp-block-posts-list__loading"
		data-wp-bind--hidden="!state.isNavigating"
		aria-live="polite"
	>
		Loading...
	</div>

	<!-- Router Region: This content updates on client navigation -->
	<div
		class="wp-block-posts-list__content"
		data-wp-router-region="posts-list-region"
		data-wp-class--is-loading="state.isNavigating"
	>
		<?php if ( $query->have_posts() ) : ?>
			<ul class="wp-block-posts-list__items">
				<?php while ( $query->have_posts() ) : $query->the_post(); ?>
					<li class="wp-block-posts-list__item">
						<article>
							<h3 class="wp-block-posts-list__title">
								<a href="<?php the_permalink(); ?>">
									<?php the_title(); ?>
								</a>
							</h3>
							<div class="wp-block-posts-list__excerpt">
								<?php the_excerpt(); ?>
							</div>
							<time 
								class="wp-block-posts-list__date"
								datetime="<?php echo get_the_date( 'c' ); ?>"
							>
								<?php echo get_the_date(); ?>
							</time>
						</article>
					</li>
				<?php endwhile; ?>
			</ul>

			<!-- Pagination -->
			<?php if ( $total_pages > 1 ) : ?>
				<nav class="wp-block-posts-list__pagination" aria-label="Posts navigation">
					<?php if ( $current_page > 1 ) : ?>
						<a
							href="<?php echo esc_url( get_pagenum_link( $current_page - 1 ) ); ?>"
							class="wp-block-posts-list__nav-link wp-block-posts-list__nav-link--prev"
							data-wp-on--click="actions.navigate"
							data-wp-on-async--mouseenter="actions.prefetch"
						>
							← Previous
						</a>
					<?php endif; ?>

					<span class="wp-block-posts-list__page-info">
						Page <?php echo $current_page; ?> of <?php echo $total_pages; ?>
					</span>

					<?php if ( $current_page < $total_pages ) : ?>
						<a
							href="<?php echo esc_url( get_pagenum_link( $current_page + 1 ) ); ?>"
							class="wp-block-posts-list__nav-link wp-block-posts-list__nav-link--next"
							data-wp-on--click="actions.navigate"
							data-wp-on-async--mouseenter="actions.prefetch"
						>
							Next →
						</a>
					<?php endif; ?>
				</nav>
			<?php endif; ?>

		<?php else : ?>
			<p class="wp-block-posts-list__empty">No posts found.</p>
		<?php endif; ?>

		<?php wp_reset_postdata(); ?>
	</div>
</div>
