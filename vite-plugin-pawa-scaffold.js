import path from 'node:path'
import fs from 'node:fs'
import { normalizePath } from 'vite'

export default function PawaScaffold() {
    const pagesDir = normalizePath(path.resolve(process.cwd(), 'src/pages'))

    return {
        name: 'vite-plugin-pawa-scaffold',
        configureServer(server) {
            server.watcher.on('add', (filePath) => {
                const normalizedPath = normalizePath(filePath)
                const isConfig = normalizedPath.endsWith('config.js');
                const isPage = normalizedPath.endsWith('page.js');
                const isError = normalizedPath.endsWith('error.js');
                const isLoading = normalizedPath.endsWith('loading.js');
                
                // Only target framework files within the pages directory
                if (normalizedPath.startsWith(pagesDir) && (isConfig || isPage || isError || isLoading)) {
                    const stats = fs.statSync(normalizedPath)
                    
                    // Only scaffold if the file is empty
                    if (stats.size === 0) {
                        const dir = path.dirname(normalizedPath)
                        let relPath = path.relative(pagesDir, dir)
                        
                        // Convert OS separators to URL slashes and handle dynamic segments
                        relPath = relPath.split(path.sep).join('/')
                        
                        let routePath = '/' + relPath
                            .replace(/\[(.+?)\]/g, ':$1') // Change [id] to :id
                            .replace(/\/index$/, '')      // Remove trailing /index
                        
                        if (routePath === '/index' || routePath === '') routePath = '/'
                        const pageName = routePath.split('/').pop() || 'Home';

                        if (isConfig) {
                            const configTemplate = `import { createServerSide } from 'supapawajs';

export default createServerSide({
    init: async ({ param, query }) => {
        // This runs on the server before the page loads
        return {
            title: '${pageName.charAt(0).toUpperCase() + pageName.slice(1)}',
            data: {}
        };
    },
    actions: {
        // Server-side logic here
    }
});
`;
                            fs.writeFileSync(normalizedPath, configTemplate)
                            console.log(`\x1b[32m[PawaJS]\x1b[0m Automated scaffold: Generated config for ${routePath}`)
                        } else if (isPage) {
                            const pageTemplate = `import { html, useInsert } from "pawajs";
import { usePage } from "supapawajs";

export const meta = {
    title: '${pageName.charAt(0).toUpperCase() + pageName.slice(1)}',
    description: 'Description for ${pageName} page'
};

export default () => {
    const { data, error } = usePage();
    useInsert({ data, error });

    return html\`
        <div class="p-6">
            <h1 class="text-3xl font-bold text-gray-800">${pageName}</h1>
            <p class="text-gray-600 mt-2">Welcome to your new page.</p>
        </div>
    \`;
};
`;
                            fs.writeFileSync(normalizedPath, pageTemplate)
                            console.log(`\x1b[32m[PawaJS]\x1b[0m Automated scaffold: Generated page component for ${routePath}`)
                        } else if (isError) {
                            const errorTemplate = `import { html, useInsert } from "pawajs";

export default ({ error, reFresh }) => {
    useInsert({ error, reFresh });
    return html\`
        <div class="p-8 text-center bg-red-50 border border-red-200 rounded-2xl shadow-sm">
            <div class="inline-flex items-center justify-center w-12 h-12 rounded-full bg-red-100 text-red-600 mb-4">
                <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path></svg>
            </div>
            <h2 class="text-xl font-bold text-gray-900">Oops! Something went wrong</h2>
            <p class="text-gray-600 mt-2 mb-6">@{error}</p>
            <button on-click="reFresh()" class="px-6 py-2.5 bg-red-600 text-white font-semibold rounded-xl hover:bg-red-700 transition-all active:scale-95 shadow-md shadow-red-200">
                Try Again
            </button>
        </div>
    \`;
};
`;
                            fs.writeFileSync(normalizedPath, errorTemplate)
                            console.log(`\x1b[32m[PawaJS]\x1b[0m Automated scaffold: Generated error boundary for ${routePath}`)
                        } else if (isLoading) {
                            const loadingTemplate = `import { html } from "pawajs";

export const Loading = () => {
    return html\`
        <div class="flex flex-col items-center justify-center p-12 space-y-4">
            <div class="relative w-12 h-12">
                <div class="absolute inset-0 border-4 border-blue-100 rounded-full"></div>
                <div class="absolute inset-0 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
            </div>
            <p class="text-gray-500 font-medium animate-pulse">Loading content...</p>
        </div>
    \`;
};
`;
                            fs.writeFileSync(normalizedPath, loadingTemplate)
                            console.log(`\x1b[32m[PawaJS]\x1b[0m Automated scaffold: Generated loading state for ${routePath}`)
                        }
                    }
                }
            })
        }
    }
}