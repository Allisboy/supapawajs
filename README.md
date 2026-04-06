# supapawajs

The "Zero-API" Meta-Framework. Built for speed, extreme Developer Experience (DX), and surgical reactivity.

## Why supapawajs?

- **No Virtual DOM:** Powered by PawaJS, updates are surgical and direct. No complex re-rendering logic.
- **Zero-API Mental Model:** Stop writing API routes. Write server actions in your `config.js` and call them as local functions in your `page.js`.
- **Automated Boilerplate:** Let the Vite plugins handle route generation and file scaffolding for you.
- **Hybrid Rendering:** Built-in support for SSR, ISR (with Redis support), and SSG out of the box.
- **Type-Safe RPC:** Full TypeScript/IDE support for your server actions and page data.

## Installation

```bash
npm install supapawajs axios pawajs
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

## Core Features

- **Incremental Static Regeneration (ISR):** Serve stale content while revalidating in the background.
- **Link Prefetching:** Automatically prefetch data for visible links or on hover for instant navigation.
- **Flash Messages:** Cross-redirect messaging made simple via `useFlash()`.
- **CSRF Protection:** Built-in protection for all state-changing server actions.
- **Progressive Loading:** Automatic progress bar integration for route transitions.

## License

MIT