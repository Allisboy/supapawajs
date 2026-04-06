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
                
                // Only target config.js files within the pages directory
                if (normalizedPath.startsWith(pagesDir) && normalizedPath.endsWith('config.js')) {
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

                        const template = `import { createServerSide } from '@/Router/serverSide/index.js';

export default createServerSide({
    init: async ({ param, query }) => {
        // This runs on the server before the page loads
        return {
            title: 'New Page',
            data: {}
        };
    },
    actions: {
        // Example action: access via useActions(window.location.pathname)
    }
});
`;
                        fs.writeFileSync(normalizedPath, template)
                        console.log(`\x1b[32m[PawaJS]\x1b[0m Automated scaffold: Generated createServerSide for ${routePath}`)
                    }
                }
            })
        }
    }
}