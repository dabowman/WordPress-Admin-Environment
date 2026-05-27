<?php
/**
 * Server-side rendering for dynamic block
 * 
 * @param array    $attributes Block attributes
 * @param string   $content    Block content
 * @param WP_Block $block      Block instance
 */

// Sanitize attributes
$number_of_posts = absint( $attributes['numberOfPosts'] ?? 5 );
$show_excerpt = (bool) ( $attributes['showExcerpt'] ?? true );

// Query posts - use caching for better performance
$cache_key = 'dynamic_block_' . md5( serialize( $attributes ) );
$posts = wp_cache_get( $cache_key );

if ( false === $posts ) {
	$query = new WP_Query( [
		'posts_per_page' => $number_of_posts,
		'post_status' => 'publish',
		'no_found_rows' => true,
		'update_post_meta_cache' => false,
	] );
	$posts = $query->posts;
	wp_cache_set( $cache_key, $posts, '', HOUR_IN_SECONDS );
}

// Get block wrapper attributes - includes all block supports classes
$wrapper_attributes = get_block_wrapper_attributes();
?>

<div <?php echo $wrapper_attributes; ?>>
	<?php if ( ! empty( $posts ) ) : ?>
		<ul class="dynamic-block__list">
			<?php foreach ( $posts as $post ) : ?>
				<li class="dynamic-block__item">
					<h3 class="dynamic-block__title">
						<a href="<?php echo esc_url( get_permalink( $post ) ); ?>">
							<?php echo esc_html( get_the_title( $post ) ); ?>
						</a>
					</h3>
					<?php if ( $show_excerpt ) : ?>
						<div class="dynamic-block__excerpt">
							<?php echo wp_kses_post( get_the_excerpt( $post ) ); ?>
						</div>
					<?php endif; ?>
				</li>
			<?php endforeach; ?>
		</ul>
	<?php else : ?>
		<p><?php esc_html_e( 'No posts found.', 'namespace' ); ?></p>
	<?php endif; ?>
</div>
