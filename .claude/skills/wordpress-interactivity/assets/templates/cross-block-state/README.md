# Cross-Block State Pattern

This template demonstrates sharing state across multiple blocks using a common store namespace.

## Structure

```
cross-block-state/
├── shared-store.js      # Shared cart store (imported by all blocks)
├── product-card/        # Block that adds items
│   ├── block.json
│   ├── render.php
│   └── view.js
└── cart-summary/        # Block that displays cart
    ├── block.json
    ├── render.php
    └── view.js
```

## How It Works

1. **Shared Store** (`shared-store.js`): Defines the cart state and actions in namespace `shop/cart`

2. **Product Card Block**: Imports shared store and calls `shop/cart::actions.addToCart`

3. **Cart Summary Block**: Reads from `shop/cart::state.items` and `shop/cart::state.total`

## Key Concepts

- Multiple `store()` calls with same namespace **merge** stores
- Cross-namespace references in directives: `namespace::state.prop` or `namespace::actions.method`
- Each block can extend the shared store with additional state/actions
- Global state persists across client-side navigation

## Usage

Both blocks can exist independently on any page. They'll automatically share state when the shared store is loaded.
