# Popular Architectures to Learn From

WooCommerce, ACF, and Action Scheduler are the best-documented examples of the patterns that scale. Read them not to copy code, but to absorb the extensibility recipe: abstract base class + pluggable storage layer + hook taxonomy scoped by object name.

## WooCommerce extensibility model

### `WC_Data` abstract class

Base for all CRUD entities (`WC_Order`, `WC_Product`, `WC_Customer`, `WC_Coupon`).

**Properties:**
- `$data` — declared props with defaults.
- `$changes` — dirty-prop tracking.
- `$meta_data` — extra metadata.
- `$data_store` — the pluggable persistence layer.

**Standard methods:** `get_id()`, `get_data()`, `set_props()`, `get_prop($key, $context)`, `set_prop()`, `save()`, `delete()`.

`view` context runs `woocommerce_{object}_get_{prop}` filters; `edit` context bypasses them. This is how themes/plugins can transform output without affecting the raw stored value.

### Data stores

Pluggable persistence via `WC_Object_Data_Store_Interface`. `WC_Data_Store::load( 'order' )` returns a store. Replace stores via `woocommerce_data_stores` / `woocommerce_{type}_data_store` filters. This is what makes HPOS possible — the same `WC_Order` API, different storage behind it.

### Typed queries

`WC_Order_Query`, `WC_Product_Query`. Public wrappers `wc_get_orders()`, `wc_get_products()`. Args map to prop names, not `WP_Query` args.

### HPOS (High-Performance Order Storage, WC 8.2+)

Default for new installs. Custom tables:
- `wp_wc_orders` — primary order row
- `wp_wc_order_addresses` — billing/shipping
- `wp_wc_order_operational_data` — ops metadata
- `wp_wc_orders_meta` — sparse meta

A `shop_order_placehold` row exists in `wp_posts` with matching ID for external compat. Compat mode dual-writes; `wc_schedule_pending_batch_process` backfills via Action Scheduler.

**Extension rules** — never do these under HPOS:
- `get_post_meta( $order_id, ... )`
- `'shop_order' === get_post_type()`

Use instead:

```php
use Automattic\WooCommerce\Utilities\OrderUtil;
$order = wc_get_order( $id );
$order->update_meta_data( '_key', $value );
$order->save();
if ( OrderUtil::custom_orders_table_usage_is_enabled() ) { /* ... */ }
```

Declare compatibility:

```php
FeaturesUtil::declare_compatibility( 'custom_order_tables', __FILE__, true );
// on before_woocommerce_init
```

### Custom `WC_Data` subclass

```php
class WC_Gift_Card extends WC_Data {
    protected $object_type = 'gift_card';
    protected $data = array( 'code' => '', 'balance' => 0.0, 'expires_at' => null );
    public function __construct( $id = 0 ) {
        parent::__construct( $id );
        $this->data_store = WC_Data_Store::load( 'gift_card' );
        if ( $id > 0 ) { $this->data_store->read( $this ); }
    }
    public function get_balance( $ctx = 'view' ) { return (float) $this->get_prop( 'balance', $ctx ); }
    public function set_balance( $v )            { $this->set_prop( 'balance', (float) $v ); }
}
```

## Advanced Custom Fields (ACF)

### Field type system

`abstract class acf_field` auto-wires filters/actions scoped by `$this->name`:

```php
class Acme_Color_Field extends acf_field {
    public function initialize() {
        $this->name     = 'brand_color';
        $this->label    = 'Brand Color';
        $this->category = 'choice';
        $this->defaults = array( 'default_value' => '#0073aa' );
    }
    public function render_field( $field ) {
        printf(
            '<input type="color" name="%s" value="%s" />',
            esc_attr( $field['name'] ),
            esc_attr( $field['value'] ?: $field['default_value'] )
        );
    }
    public function format_value( $value, $post_id, $field ) {
        return sanitize_hex_color( $value );
    }
}
add_action( 'acf/include_field_types', fn() => acf_register_field_type( Acme_Color_Field::class ) );
```

### Storage

Field groups = CPT `acf-field-group`; fields = child posts of type `acf-field`. Values live in post/user/term/options meta.

### Location rules

OR of AND groups: `post_type`, `post_template`, `page_template`, `current_user_role`, `taxonomy`, `block`, `options_page`. Extensible via `acf/location/rule_types`.

### Accessor API

`get_field()`, `the_field()`, `get_sub_field()`, `have_rows()`/`the_row()`, `get_field_object()`. `$post_id` can be `'options'`, `'user_42'`, `'term_5'`, `'block_id'`.

### Local JSON sync

`acf-json/` directory in theme/plugin. On save, writes `group_<key>.json` with `modified` timestamp. On load, diffs DB vs JSON; newer JSON shows "Sync Available". Makes field groups VCS-friendly.

Filters: `acf/settings/save_json`, `acf/settings/load_json`.

### ACF Blocks

`acf_register_block_type()` / `block.json` + `"acf":{...}`. PHP-rendered dynamic block; UI is composed from an ACF field group (via the `block` location rule). Supports `InnerBlocks` in the template.

### Key hooks

`acf/init`, `acf/include_fields`, `acf/load_field/name=foo`, `acf/format_value`, `acf/update_value`, `acf/save_post`, `acf/validate_value`.

## Action Scheduler

Library at actionscheduler.org, embedded in WooCommerce. **The de facto background-job system for WordPress.** Proven at 50K+ queued actions; millions monthly across WooCommerce-powered stores.

### API

| Function | Purpose |
|----------|---------|
| `as_enqueue_async_action($hook, $args, $group)` | Run ASAP in background |
| `as_schedule_single_action($ts, $hook, $args, $group)` | One-shot |
| `as_schedule_recurring_action($first_ts, $interval, $hook, $args, $group)` | Fixed-interval |
| `as_schedule_cron_action($first_ts, $cron_expr, $hook, $args, $group)` | Cron expression |
| `as_unschedule_action($hook, $args, $group)` | Next match |
| `as_unschedule_all_actions($hook, $args, $group)` | All matches |
| `as_next_scheduled_action($hook, $args, $group)` | Timestamp or false |
| `as_has_scheduled_action($hook, $args, $group)` | Bool |

All return the action **ID** (vs WP-Cron's bool). Register after `init` priority 1 (or on `action_scheduler_init`).

### Example

```php
add_action( 'acme/send_followup', 'acme_send_followup', 10, 2 );
add_action( 'woocommerce_order_status_completed', function( $order_id ) {
    $order = wc_get_order( $order_id );
    if ( as_has_scheduled_action(
        'acme/send_followup',
        array( $order_id, $order->get_billing_email() ),
        'acme'
    ) ) { return; }

    as_schedule_single_action(
        time() + 3 * DAY_IN_SECONDS,
        'acme/send_followup',
        array( $order_id, $order->get_billing_email() ),
        'acme'
    );
} );
```

### Why it beats WP-Cron

- **Custom DB tables** — no options-table bloat.
- **Claim locking** — multi-worker safe.
- **Batch processing** — chews through large queues.
- **Admin UI** at Tools → Scheduled Actions.
- **Retries on failure** built in.
- **Scalability** — proven in WooCommerce at massive scale.

Use Action Scheduler whenever you have >50 concurrent jobs, need retries, or need time-precision guarantees.

## Feature plugin pattern

Core WordPress features are staged as feature plugins before merging:
- **Gutenberg** (since 2017)
- **Site Editor / FSE**
- **REST API** (merged in 4.7)
- **Interactivity API** (merged in 6.5)
- **Performance Lab** (ongoing)

**Benefits:** fast iteration outside core's 3x/year cycle, API drop/rework freedom, broad testing before stabilization, feature flagging via activation.

**Canonical plugins** (officially blessed, not merged): Akismet (bundled), Hello Dolly, the Importer family, Classic Editor, Classic Widgets. These exist to preserve functionality that has been deprecated in core.

If you're building a substantial new capability for WordPress itself, the feature-plugin pattern is how you propose it: ship as a standalone plugin, iterate publicly, get feedback, then propose core merge once it's stable.
