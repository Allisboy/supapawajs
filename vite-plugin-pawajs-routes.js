import path from 'node:path'
import fs from 'node:fs'
import { normalizePath } from 'vite'

const pagesDir = normalizePath(path.resolve(process.cwd(), 'src/pages'))

function getConfigDetails(dir, configFile) {
  if (!configFile) return { hasMiddleware: false, isSsr: false, isIsr: false, isStatic: false, revalidate: null, hasGenerateParams: false }
  try {
    
    const configPath = path.join(dir, configFile.name)
    const content = fs.readFileSync(configPath, 'utf-8')
    const hasMiddleware = /middleware\s*[:=]/.test(content)
    const isSsr = /ssr\s*[:=]\s*true/.test(content) || /type\s*[:=]\s*['"]ssr['"]/.test(content)
    const isIsr = /isr\s*[:=]\s*true/.test(content) || /type\s*[:=]\s*['"]isr['"]/.test(content)
    const queryPage = /pageQuery\s*[:=]\s*true/.test(content) 
    const isStatic = /static\s*[:=]\s*true/.test(content) || /type\s*[:=]\s*['"]static['"]/.test(content)
    const hasGenerateParams = /generateParams\s*[:=]/.test(content)

    let revalidate = null
    if (isIsr) {
      const revalidateMatch = content.match(/revalidate\s*[:=]\s*(\d+)/)
      if (revalidateMatch) {
        revalidate = parseInt(revalidateMatch[1], 10)
      }
    }
    return { hasMiddleware, isSsr, isIsr, isStatic, revalidate, hasGenerateParams,queryPage }
  } catch (e) {
    return { hasMiddleware: false, isSsr: false, isIsr: false, isStatic: false, revalidate: null, hasGenerateParams: false,queryPage:false }
  }
}

function getFolderStructure(dir, relativeBase = '', isSsr = false, parentHasMiddleware = false) {
  const entries = fs.readdirSync(dir, { withFileTypes: true })
  const routes = []

  // Check for page.js and config.js
  const pageFile = entries.find(e => e.name === 'page.js' && e.isFile())
  const configFile = entries.find(e => e.name === 'config.js' && e.isFile())
  const notFoundFile = entries.find(e => e.name === '404.js' && e.isFile())
  const loadingFile = entries.find(e => e.name === 'loading.js' && e.isFile())
  const errorFile = entries.find(e => e.name === 'error.js' && e.isFile())

  // Check config to determine middleware presence and render type
  const configDetails = getConfigDetails(dir, configFile)
  const currentHasMiddleware = parentHasMiddleware || configDetails.hasMiddleware

  // Filter and process directories
  // Added ignore feature: folders starting with '_' are ignored from routing
  const dirs = entries.filter(e => e.isDirectory() && !e.name.startsWith('_'))
  
  // Build children routes recursively
  const children = dirs.map(d => {
    const subDir = path.join(dir, d.name)
    const subRelative = path.join(relativeBase, d.name)
    return getFolderStructure(subDir, subRelative, isSsr, currentHasMiddleware)
  }).flat()

  // Determine the route segment name
  let segment = path.basename(dir)
  // If we are at the root pages directory, the segment is empty
  if (normalizePath(dir) === pagesDir) {
    segment = ''
  }

   // routePath should only be the segment for this specific folder (e.g. ":id")
  let routePath = segment.replace(/^\[(.+)\]$/, ':$1')
  
  if (segment === 'index') {
    routePath = ''
  }

  // routeName must be unique across the project to avoid state collisions.
  // We generate it from the full relative path to preserve the hierarchy.
  // e.g. "notifications/[id]" becomes "notifications-id"
  let routeName = relativeBase
    .replace(/\[(.+?)\]/g, '$1') // Convert [id] to id for naming
    .replace(/[\/\\]/g, '-')     // Replace directory separators with hyphens
    .replace(/^index-?/, '')     // Remove leading "index" from name
    .replace(/-?index$/, '')     // Remove trailing "index" from name
    .replace(/:/g, '')           // Strip colons from final name

  // Ensure index folders have unique names to avoid collisions with root or parent pages
  if (segment === 'index') {
    routeName = routeName ? `${routeName}-index` : 'index-index'
  }

  if (!routeName) routeName = 'index'

  // Create the route object if this folder is a route (has page.js) or has children
  // We prioritize folders that have a page.js as actual route nodes.
  // Directories without page.js but with children act as groups.
  // Folders with only a config.js become virtual routes for actions.
  
  if (pageFile || children.length > 0 || configFile) {
    // Determine render style: SSR (Explicit or Middleware) > ISR > Static (Default)
    let render = 'static'
    let queryPage=false
    // Middleware forces SSR for security (cookies/auth headers are dynamic)
    if (configDetails.isSsr || currentHasMiddleware) {
      render = 'ssr'
    } else if (configDetails.isIsr) {
      render = 'isr'
    } else if (configDetails.isStatic) {
      render = 'static'
    }
     if(configDetails.queryPage){
      queryPage=true
    }

    const getEffectiveChildPaths = (nodes) => {
      let paths = []
      nodes.forEach(node => {
        if (node.component) {
          paths.push(node.path)
        } else if (node.children) {
          getEffectiveChildPaths(node.children).forEach(p => {
            paths.push([node.path, p].filter(Boolean).join('/'))
          })
        }
      })
      return paths
    }

    const childViews = (children.length > 0 
      ? getEffectiveChildPaths(children).map(p => `\n<route-view :path="'${p}'"></route-view>`).join('')
      : '') + (notFoundFile ? '\n<not-found></not-found>' : '')

    const routeObj = {
      name: routeName,
      path: routePath,
      render,
      inQuery:queryPage,
      childViews,
      notfound: notFoundFile ? `() => import('${normalizePath(path.join(dir, notFoundFile.name))}')` : false,
      loading: loadingFile ? `() => import('${normalizePath(path.join(dir, loadingFile.name))}')` : false,
      error: errorFile ? `() => import('${normalizePath(path.join(dir, errorFile.name))}')` : false,
      children: children.length > 0 ? children : undefined
    }

    if (render === 'isr' && configDetails.revalidate !== null) {
      routeObj.revalidate = configDetails.revalidate
    }

    if (pageFile) {
      const fullPath = normalizePath(path.join(dir, pageFile.name))
      // Use dynamic import for the component
      routeObj.component = `() => import('${fullPath}')`
    }

    // Attach serverSide config import if config.js exists.
    // This allows static pages to have `init` or `generateParams` for SSG.
    if (configFile && isSsr) {
      const configPath = normalizePath(path.join(dir, configFile.name))
      // Attach the config import to serverSide property
      routeObj.serverSide = `() => import('${configPath}')`
    }

    // If we are at the root 'src/pages' and there is no 'page.js' (root layout),
    // we unwrap the children so the routes array is flat at the top level.
    if (normalizePath(dir) === pagesDir && !pageFile) {
      const rootNotFound = notFoundFile ? `() => import('${normalizePath(path.join(dir, notFoundFile.name))}')` : undefined
      const rootLoading = loadingFile ? `() => import('${normalizePath(path.join(dir, loadingFile.name))}')` : undefined
      
      const mappedChildren = children.map(child => ({
        ...child,
        path: child.path.startsWith('/') ? child.path : `/${child.path}`
      }))

      if (rootNotFound || rootLoading) {
        const indexRoute = mappedChildren.find(c => c.path === '/')
        if (indexRoute) {
          if (rootNotFound) indexRoute.notfound = rootNotFound
          if (rootLoading) indexRoute.loading = rootLoading
        } else {
          mappedChildren.push({
            name: 'index',
            path: '/',
            notfound: rootNotFound || false,
            loading: rootLoading || false
          })
        }
      }
      return mappedChildren
    }

    // If it's a valid route node (has component) or a valid group, add it.
    // Note: If no component, it acts as a layout-less container for children
    routes.push(routeObj)
  }

  return routes
}

function generateRoutesCode(isSsr) {
  const routes = getFolderStructure(pagesDir, '', isSsr)
  
  // Helper to stringify the object but keep function strings intact (for imports)
  const stringify = (obj) => {
    return JSON.stringify(obj, null, 2).replace(/"component":\s*"([^"]+)"/g, '"component": $1')
                                       .replace(/"serverSide":\s*"([^"]+)"/g, '"serverSide": $1')
                                       .replace(/"notfound":\s*"([^"]+)"/g, '"notfound": $1')
                                       .replace(/"loading":\s*"([^"]+)"/g, '"loading": $1')
                                       .replace(/"error":\s*"([^"]+)"/g, '"error": $1')
  }

  return `
    const routes = ${stringify(routes)};
    
    // On server, 'routes' includes serverSide properties.
    // On client, it is just the standard routes.
    
    export const serverRoutes = routes;
    export default routes;
  `
}

export default function PawaRoutes() {
  const virtualModuleId = '~pages'
  const resolvedVirtualModuleId = '\0' + virtualModuleId

  return {
    name: 'vite-plugin-pawajs-routes',
    configureServer(server) {
      const listener = (file) => {
        if (normalizePath(file).startsWith(pagesDir)) {
          const mod = server.moduleGraph.getModuleById(resolvedVirtualModuleId)
          if (mod) server.reloadModule(mod)
        }
      }
      // Watch src/pages for changes to reload the virtual module
      server.watcher.on('add', listener)
      server.watcher.on('unlink', listener)
      server.watcher.on('addDir', listener)
      server.watcher.on('unlinkDir', listener)
    },
    /**
     * Shreds server-side logic from config.js files when building for the client.
     */
    transform(code, id, options) {
      if (id.endsWith('config.js') && !options?.ssr) {
        const dir = path.dirname(id);
        
        // Determine the route path using the same logic as the discovery phase
        const relativeDir = path.relative(pagesDir, dir);
        const segments = relativeDir.split(path.sep);
        const routePath = '/' + segments
            .map(s => s.replace(/^\[(.+)\]$/, ':$1'))
            .filter(s => s !== 'index' && s !== '')
            .join('/');

        // Extract action names using regex to avoid importing the file
        const actionNames = [];
        const actionsStartMatch = code.match(/actions\s*:\s*\{/);
        if (actionsStartMatch) {
            let depth = 0;
            let endIdx = -1;
            const startIdx = actionsStartMatch.index + actionsStartMatch[0].indexOf('{');

            for (let i = startIdx; i < code.length; i++) {
                if (code[i] === '{') depth++;
                else if (code[i] === '}') {
                    depth--;
                    if (depth === 0) {
                        endIdx = i;
                        break;
                    }
                }
            }

            if (endIdx !== -1) {
                const actionsContent = code.substring(startIdx + 1, endIdx);
                let currentDepth = 0;
                let sanitizedContent = "";
                for (let i = 0; i < actionsContent.length; i++) {
                    const char = actionsContent[i];
                    if (char === '{') currentDepth++;
                    sanitizedContent += currentDepth === 0 ? char : " ";
                    if (char === '}') currentDepth--;
                }
                const keyRegex = /([a-zA-Z_$][a-zA-Z0-9_$]*)\s*:/g;
                let match;
                while ((match = keyRegex.exec(sanitizedContent)) !== null) {
                    actionNames.push(match[1]);
                }
            }
        }

        const hasInit = /init\s*[:=]/.test(code);
        const hasMiddleware = /middleware\s*[:=]/.test(code);

        // Replace the module content with a clean metadata stub
        return {
          code: `export default { 
            client: { 
              route: '${routePath || '/'}', 
              actions: ${JSON.stringify(actionNames)}, 
              init: ${hasInit},
              middleware: ${hasMiddleware}
            } 
          };`,
          map: null
        };
      }
      return null;
    },
    resolveId(id) {
      if (id === virtualModuleId) return resolvedVirtualModuleId
    },
    load(id, options) {
      if (id === resolvedVirtualModuleId) {
        const isSsr = options?.ssr === true
        return generateRoutesCode(isSsr)
      }
    }
  }
}