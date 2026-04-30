// Compatibility re-export — src/routing/* is superseded by src/runtime/routing/*
// (see docs/wp-admin-shell-v1-plan.md M1 disposition table). Surviving MVP app
// components import `navigate`/`useRoute` from this path; this shim keeps the
// single runtime router as the source of truth without rewriting every import
// site at once. Remove after MVP apps are migrated.
export { useRoute, navigate, navigateRoute, RouterProvider } from '../runtime/routing/router';
