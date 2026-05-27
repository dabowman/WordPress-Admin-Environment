<?php
/**
 * Filter Search Block - Server-side render
 *
 * @var array    $attributes Block attributes.
 * @var string   $content    Inner block content.
 * @var WP_Block $block      Block instance.
 */

$post_type   = $attributes['postType'] ?? 'post';
$placeholder = $attributes['placeholder'] ?? 'Search...';
$min_chars   = $attributes['minChars'] ?? 3;

// Initialize state with REST API endpoint
wp_interactivity_state(
	'NAMESPACE/filter-search',
	array(
		'searchTerm'  => '',
		'results'     => array(),
		'isSearching' => false,
		'hasSearched' => false,
		'error'       => null,
		'restUrl'     => rest_url( 'wp/v2/' . $post_type ),
		'minChars'    => $min_chars,
	)
);
?>

<div
	data-wp-interactive="NAMESPACE/filter-search"
	<?php echo get_block_wrapper_attributes( array( 'class' => 'wp-block-filter-search' ) ); ?>
>
	<!-- Search Input -->
	<div class="wp-block-filter-search__input-wrapper">
		<input
			type="search"
			class="wp-block-filter-search__input"
			placeholder="<?php echo esc_attr( $placeholder ); ?>"
			data-wp-on--input="actions.handleSearch"
			data-wp-bind--value="state.searchTerm"
			aria-label="<?php echo esc_attr( $placeholder ); ?>"
		/>
		
		<!-- Loading Indicator -->
		<span
			class="wp-block-filter-search__spinner"
			data-wp-bind--hidden="!state.isSearching"
			aria-hidden="true"
		></span>
	</div>

	<!-- Status Messages -->
	<div
		class="wp-block-filter-search__status"
		role="status"
		aria-live="polite"
	>
		<p
			data-wp-bind--hidden="!state.isSearching"
			data-wp-text="'Searching...'"
		></p>
		
		<p
			data-wp-bind--hidden="state.isSearching || !state.hasSearched || state.results.length > 0 || state.error"
			data-wp-text="'No results found for \"' + state.searchTerm + '\"'"
		></p>
		
		<p
			data-wp-bind--hidden="!state.error"
			class="wp-block-filter-search__error"
			data-wp-text="state.error"
		></p>
	</div>

	<!-- Results List -->
	<ul
		class="wp-block-filter-search__results"
		data-wp-bind--hidden="state.results.length === 0"
	>
		<template data-wp-each--result="state.results">
			<li class="wp-block-filter-search__result">
				<a
					data-wp-bind--href="context.result.link"
					class="wp-block-filter-search__result-link"
				>
					<span
						class="wp-block-filter-search__result-title"
						data-wp-text="context.result.title.rendered"
					></span>
					<span
						class="wp-block-filter-search__result-excerpt"
						data-wp-text="context.result.excerpt?.rendered?.replace(/<[^>]*>/g, '').substring(0, 100) + '...'"
					></span>
				</a>
			</li>
		</template>
	</ul>
</div>
