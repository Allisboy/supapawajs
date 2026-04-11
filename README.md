# supapawajs

**The Zero-API Meta-Framework.**  
*Built for speed, extreme Developer Experience (DX), and surgical reactivity.*

`supapawajs` is a full-stack meta-framework powered by **PawaJS**. It eliminates the need for manual API route definitions by bridging the gap between server logic and client UI through a seamless RPC-style mental model.

## Why supapawajs?

- **No Virtual DOM:** Powered by PawaJS, updates are surgical and direct. No complex re-rendering logic.
- **Zero-API RPC:** Stop writing boilerplate `fetch()` calls. Define server actions in a `config.js` and call them as type-safe functions in your UI.
- **Hybrid Rendering:** Switch between **SSR** (Server-Side Rendering), **ISR** (Incremental Static Regeneration), and **SSG** (Static Site Generation) on a per-route basis.
- **Robust Auth System:** Built-in Session Providers and Database Adapters (SQL/Redis) with ready-to-use protection middleware.
- **Automated Scaffolding:** Create an empty file, and the framework generates the boilerplate for you (Pages, Configs, Errors, and Loaders).
- **Built-in Security:** Automatic CSRF protection for all server actions and easy middleware integration.
- **Surgical Reactivity:** Direct DOM updates with minimal overhead.

## Installation

```bash
npm install supapawajs pawajs ioredis
```

## Quick Start

### 1. Configure your Vite Plugin

```javascript
// vite.config.js
import { PawaRoutes, PawaScaffold } from 'supapawajs/plugins';

export default {
  plugins: [
    PawaRoutes(),
    PawaScaffold()
  ]
}
```

### 2. Define your Route Logic (`config.js`)

Create a folder in `src/pages/profile/[id]` and add a `config.js`.

```javascript
import { createServerSide } from 'supapawajs';

export default createServerSide({
    init: async ({ param }) => {
        return await db.getUser(param.id);
    },
    actions: {
        updateBio: async ({ reqData }) => {
            return await db.updateUser(reqData.id, { bio: reqData.bio });
        }
    }
});
```

### 3. Build your UI (`page.js`)

```javascript
import { html,useInsert } from 'pawajs';
import { usePage, useActions } from 'supapawajs';

export default () => {
    const { data } = usePage();
    const { action, loading, error } = useActions();

    const save = async (bio) => {
        await action.updateBio({ id: data.id, bio });
    };
    useInset({data,save,error,loading})
    return html`
        <h1>Profile: @{data.name}</h1>
        <button on-click="save('New Bio')" disabled="@{loading.value.updateBio}">
            ${loading.value.updateBio ? 'Saving...' : 'Update Bio'}
        </button>
        <p if="error.value.updateBio" class="error">@{error.value.updateBio.message}</p>
    `;
}
```
#### `<Router />`
The root orchestrator for your application's routing. It enhances the History API and manages the global route state.

| Prop | Type | Description |
| :--- | :--- | :--- |
| `children` | `html` | The main application template. Use the `<route-entry></route-entry>` placeholder inside to automatically inject top-level routes. |

#### `<RouteView />`
Used to render the component associated with a specific route path. It can be nested to create complex layouts.

| Prop | Type | Description |
| :--- | :--- | :--- |
| `path` | `string \| () => string` | The route path to match. If nested, it appends to the parent's path. Supports dynamic segments (e.g., `:id`). |
| `intercept` | `() => boolean` | If returns `true`, the component will "intercept" the current URL matching logic. Highly useful for rendering modals or drawers that have their own URL. |
| `guard` | `() => boolean` | A client-side protection function. If it returns `false`, the component will not mount even if the path matches. |
| `children` | `html` | Elements to render inside the route view, typically passed to the child component or used for further nesting. |

**Example with Nesting:**
```javascript
html`
  <RouteView :path="'/admin'">
      <RouteView :path="'dashboard'"></RouteView>
      <RouteView :path="'users'"></RouteView>
  </RouteView>
`
```

**Example of intercept route : using (<intercept-route>)**
```javascript
html`
  <route-view :path="'/admin'" :intercept>
     <div class="overlay">
        <intercept-route></intercept-route>
     </div> 
  </route-view>
`
```
## Core Features

- **Incremental Static Regeneration (ISR):** Serve stale content while revalidating in the background.
- **Link Prefetching:** Automatically prefetch data for visible links or on hover for instant navigation.
- **Flash Messages:** Cross-redirect messaging made simple via `useFlash()`.
- **CSRF Protection:** Built-in protection for all state-changing server actions.
- **Progressive Loading:** Automatic progress bar integration for route transitions.

## License

MIT