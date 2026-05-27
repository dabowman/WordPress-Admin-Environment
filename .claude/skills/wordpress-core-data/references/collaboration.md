# Real-time collaboration (WP 7.0, experimental)

**Status:** experimental in WP 7.0. Phase 3 Gutenberg work. The architecture is stable; the public API surface is not. Treat anything in this file as `__experimental` unless it reaches a stable release.

## What's in 7.0

- `@wordpress/sync` ships as a stable package with an experimental API surface.
- Yjs CRDT-backed sync. Default HTTP polling provider for host compatibility; optional WebSocket / WebRTC.
- Provider plug-in via the `sync.providers` filter.
- Limited entity opt-in: `postType/post`, `postType/page`, gated site-editor entities.

## `@wordpress/sync` package surface

```ts
createSyncProvider( connectLocal, connectRemote ): SyncProvider;
connectIndexDb( objectId, objectType, doc ): Promise<() => void>;
createWebRTCConnection( { signaling, password? } ): ConnectDoc;
```

## Provider registration

```js
addFilter( 'sync.providers', 'my-plugin/ws', ( creators ) => [
  async ( { objectType, objectId, ydoc, awareness } ) => {
    const provider = new WebsocketProvider(
      'wss://rtc.example.com',
      `${ objectType }:${ objectId }`,
      ydoc,
      { awareness }
    );
    return {
      destroy: () => provider.destroy(),
      on: ( ev, cb ) => provider.on( ev, cb ),
    };
  },
] );
```

## Architecture

- `Y.Doc` per synced entity.
- `Y.XmlFragment` or `Y.Array<Y.Map>` for blocks; `Y.Map` for meta.
- **Awareness** for presence (cursor positions, selection, user identity).
- **Hot path (transient):** block edits and selection broadcast via Yjs awareness — no REST round-trips.
- **Cold path (persistent):** REST save via leader election. Exactly one peer writes; the rest receive the merged record back.
- Presence: `provider.awareness.setLocalStateField( 'selection', getSelection() )`.

## Entity opt-in

Entities declare `syncObjectType` and `syncConfig` with:

- `fetch` — initial document state from REST.
- `applyChangesToDoc( record, doc )` — REST → Y.Doc.
- `applyChangesToRecord( doc, record )` — Y.Doc → REST shape.
- `getOwnPropertyNames` — which top-level fields the doc owns.

WP 7.0 supports `postType/post`, `postType/page`, and gated site-editor entities. Custom entities can opt in but the API is `__experimental`.

## Custom stores + bindings under sync

- **Custom stores must dispatch through the sync provider** — never mutate local state directly.
- **Binding sources must read from synced entity state.** Don't keep source state in `useState` or in non-synced custom stores; they desync across peers.

## Limitations in 7.0

- No stable public API.
- No conflict UI.
- Meta boxes auto-disable collaboration (the legacy form-submit flow can't participate in CRDT merges).
- Limited entity support.
- Side effects on insertion fire on **every** peer — guard with leader-election checks if you have one-shot side effects (analytics, server-side mutations).

## When to use this in 7.0

- Internal tools where API breakage is acceptable between releases.
- Experimentation. Prototypes. Feedback for core.

For production, wait for stabilization or build on the leader-elected REST save path with optimistic UI — same end-user experience for most cases without the experimental dependency.
