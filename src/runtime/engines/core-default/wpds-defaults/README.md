# WPDS defaults snapshots

Per-WordPress-version snapshots of `@wordpress/theme/src/prebuilt/css/design-tokens.css`. The cascade resolver loads the snapshot keyed by `workspace.json.$wpds` as the implicit `core` baseline so author files can override individual slots without re-authoring the whole matrix.

## Files

| File | Pinned to |
|---|---|
| `6.9.json` | WordPress 6.9 / `@wordpress/theme@0.10.0` |

Each file is `{ meta: { wpdsVersion, packageVersion, slotCount, ... }, slots: { '--wpds-*': '<value>', ... } }`.

## Regenerating

```bash
node scripts/snapshot-wpds.mjs
```

Pulls from `node_modules/@wordpress/theme/src/prebuilt/css/design-tokens.css`. Bump `@wordpress/theme` first if you want a newer version captured.

## CI parity

`tests/parity/wpds-snapshot.test.mjs` parses the same upstream CSS at test time and diffs the slot list against the snapshot. Added/renamed/removed slots fail the build, signalling that the upstream WPDS release needs a coordinated bump (new snapshot file plus `$wpds` constant updates downstream).
