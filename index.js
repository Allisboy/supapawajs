import { startStreamApp, startApp } from 'pawa-ssr'
import routes from '~pages'
import { matchRoute } from '../index.js'
import crypto from 'node:crypto'
import { parse, serialize } from 'cookie'
import fs from 'node:fs';
import path from 'node:path';
import Redis from 'ioredis';


/**
 * @type {Array<{name:string,group:Array<string>,routeNames:Array<string>,route:string}>}
 */
const routeArray = []
const routeMap = new Map()
const serverRouteMaps = new Map()
const actionsRoute = new Map()
const server = []
let routeMapsCached = false
const globalMiddlewares = []

// Persistent ISR cache with in-memory fallback
const memoryCache = new Map();
const redisClient = (process.env.USE_REDIS === 'true' || process.env.REDIS_URL) 
    ? new Redis(process.env.REDIS_URL || 'redis://localhost:6379') 
    : null;

const isrCache = {
    async get(key) {
        if (redisClient) {
            const data = await redisClient.get(key).catch(() => null);
            if (data) {
                try {
                    return JSON.parse(data);
                } catch (e) {
                    console.error(`[ISR Cache] Parse error for key ${key}:`, e);
                }
            }
        }
        return memoryCache.get(key) || null;
    },
    async set(key, value, ttlSeconds = null) {
        if (redisClient) {
            const args = [key, JSON.stringify(value)];
            if (ttlSeconds) args.push('EX', ttlSeconds);
            await redisClient.set(...args).catch(() => {});
        } else {
            memoryCache.set(key, value);
        }
    },
    async invalidate(key) {
        if (redisClient) {
            await redisClient.del(key).catch(() => {});
        }
        memoryCache.delete(key);
    }
};

// console.log(routes);



export const addGlobalMiddleware = (...middleware) => {
    middleware.forEach(m => globalMiddlewares.push(m))
}

/**
 * @typedef {{name:string,routeNames:Array<>,route:string,group:string}} RouteTypes
 */
/**
 * @param {Array<{route:string,next:Array<dRoutes>,group:string,load:()=>ImportNodeOptions}>} dRoutes
 * @param {{name:string,group:Array<string>,routeNames:Array<string>,route:string} | null} parentRoute
 */
const routeEntry = (dRoutes, parentRoute) => {
    dRoutes.forEach((value) => {
        const path = value.path !== undefined ? value.path : (value.route || '')
        const children = value.children || value.next
        const component = value.component || value.load
        
        const configRoute = {
            name: '',
            route: parentRoute ? `${parentRoute.route === '/' ? '' : parentRoute.route}/${path}` : path,
            routeNames: parentRoute ? [...parentRoute?.routeNames] : [],
            notfound: '',
            // Pass render style from vite-plugin-pawajs-routes
            render: value.render,
            revalidate: value.revalidate,
            hasComponent: !!component
        }
        
        configRoute.route = configRoute.route.replace(/\/\//g, '/')
        const name = value.name || (path.startsWith('/') ? path.slice(1) : path)
        
        configRoute.name = configRoute.route === '/' ? 'index' : name
        if (path === '') {
            configRoute.name = `${configRoute.name}-index`
        }
        
        configRoute.notfound = value?.notfound ? configRoute.route : parentRoute?.notfound
        configRoute.notfound = configRoute.notfound ? configRoute.notfound : ''
        configRoute.routeNames.push(configRoute.name)
        
        if (Array.isArray(children)) {
            routeEntry(children, configRoute)
        }
        
        routeArray.push(configRoute)
        routeMap.set(configRoute.route, {name: configRoute.name, load: component})
    })
} 

/**
 * @typedef {Object} PawaContext
 * @property {string} url - Current URL
 * @property {Record<string, string>} param - Dynamic route parameters
 * @property {Record<string, string>} query - URL query parameters
 * @property {Record<string, any>} reqData - Payload for actions
 * @property {string} title - Page title
 * @property {string} description - Meta description
 * @property {import('node:http').IncomingMessage} request - Node request
 * @property {import('node:http').ServerResponse} response - Node response
 * @property {(url: string, msg?: string, status?: number, type?: string) => void} redirect - Redirect helper
 * @property {(msg: string, type?: string) => void} flash - Set a flash message
 */

/**
 * @template {Record<string, (context: PawaContext) => Promise<any>>} [A=Record<string, any>]
 * @typedef {Object} CreateServerSideConfig
 * @property {string} [name] - Optional name for the route
 * @property {string} [title] - Page title
 * @property {string} [description] - Meta description
 * @property {Array<Function>} [middleware] - List of middleware functions
 * @property {A} [actions] - Server actions
 * @property {(context: PawaContext) => Promise<any>} [init] - Initial data fetching for SSR
 * @property {any} [rateLimit] - Rate limiting configuration
 * @property {(context: PawaContext) => Promise<Array<Record<string, string>>>} [generateParams] - Static site generation parameters
 */

/**
 * Creates a server-side configuration for a route.
 * The route path is automatically inferred from the file system.
 * 
 * @template {Record<string, (context: PawaContext) => Promise<any>>} A
 * @param {CreateServerSideConfig<A>} config
 * @returns {{ server: CreateServerSideConfig<A> & { route: string }, client: { init: boolean, route: string, name: string, middleware: boolean } }}
 */
export const createServerSide = (config) => {
    const actions = config?.actions || /** @type {A} */ ({})
    
    const serverController = {
        title: config?.title,
        description: config?.description,
        init: config?.init,
        route: null, // Filled automatically by buildRouteMaps
        name: config?.name,
        middleware: config?.middleware,
        actions,
        rateLimit: config?.rateLimit,
        generateParams: config?.generateParams
    }
    
    const clientController = {
        init: config?.init ? true : false,
        route: null, // Filled automatically by buildRouteMaps
        name: config?.name,
        middleware: (config?.middleware?.length || 0) > 0 ? true : false
    }
    
    return {
        server: serverController,
        client: clientController
    }
}

const RouterConfig = (dRoutes = []) => {
    routeEntry(dRoutes)
}


RouterConfig(routes)

// console.log(routes,'server side');

export const setServerSide = (...serverConfig) => {
    serverConfig.forEach(s => server.push(s))
}

// ===== HELPER FUNCTIONS =====

// Simple in-memory rate limiter
const MESSAGES = {
    RATE_LIMIT: 'Too many requests. Please slow down and try again later.',
    TIMEOUT: 'The operation timed out. Please check your connection and try again.'
};

const rateLimits = new Map();
const cleanupInterval = setInterval(() => {
    // periodic cleanup to prevent memory leaks from old IPs
    const now = Date.now();
    for (const [ip, data] of rateLimits.entries()) {
        if (now - data.startTime > 60000) rateLimits.delete(ip);
    }
}, 60000);

// Prevent the cleanup interval from hanging the process during builds
if (cleanupInterval.unref) cleanupInterval.unref();

const isRateLimited = (req, limit = 100, windowMs = 60000) => {
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
    const now = Date.now();
    const record = rateLimits.get(ip);

    if (!record || (now - record.startTime > windowMs)) {
        rateLimits.set(ip, { count: 1, startTime: now });
        return false;
    }

    if (record.count >= limit) return true;
    record.count++;
    return false;
};

/**
 * Handle server actions via API calls
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @returns {Promise<void>}
 */
export const handleServerAction = async (req, res) => {
    try {
        // Build route maps if needed
        if (__pawaDev || !routeMapsCached) {
            await buildRouteMaps()
            routeMapsCached = true
        }
        
        // Parse action request
        let { route, action, data } = req.body || {}
        
        // Handle multipart/form-data (FormData) where 'data' wrapper might be missing
        // and fields are flattened in req.body
        // Handle multipart/form-data (FormData) where 'data' wrapper might be missing
if (!data && (req.files || (req.headers['content-type'] || '').includes('multipart/form-data'))) {
    const flatData = { ...req.body };
    delete flatData.route;
    delete flatData.action;
    
    data = flatData;
    
    // Handle different multer configurations
    if (req.files) {
        // CASE 1: multer.any() - array of files with fieldname
        if (Array.isArray(req.files)) {
            
            req.files.forEach((file) => {
                // Store as array for multiple files per field, or single file if only one
                if (!data[file.fieldname]) {
                    data[file.fieldname] = file;
                } else if (Array.isArray(data[file.fieldname])) {
                    data[file.fieldname].push(file);
                } else {
                    data[file.fieldname] = [data[file.fieldname], file];
                }
            });
        } 
        // CASE 2: multer.fields() - object with fieldname → array of files
        else if (typeof req.files === 'object') {
            Object.keys(req.files).forEach(fieldname => {
                const files = req.files[fieldname];
                if (files.length === 1) {
                    // Single file for this field
                    data[fieldname] = files[0];
                } else {
                    // Multiple files for this field
                    data[fieldname] = files;
                }
            });
        }
    }
    
    // CASE 3: multer.single() - single file in req.file
    if (req.file) {
        data[req.file.fieldname] = req.file;
    }
}
        
        if (!route || !action) {
            return res.status(400).json({
                error: 'Missing route or action',
                message: 'Request must include "route" and "action" fields'
            })
        }
        
        // Get actions for this route
        const routeActions = actionsRoute.get(route)
        
        if (!routeActions) {
            return res.status(404).json({
                error: 'Route not found',
                message: `No actions registered for route: ${route}`
            })
        }
        
        const actionHandler = routeActions[action]
        
        if (!actionHandler) {
            return res.status(404).json({
                error: 'Action not found',
                message: `Action "${action}" not found on route: ${route}`
            })
        }
        
        // Create router context for action
        // CSRF Protection: Validate token before proceeding
        const cookies = req.headers.cookie ? parse(req.headers.cookie) : {};
        const csrfCookie = cookies['XSRF-TOKEN'];
        const csrfHeader = req.headers['x-csrf-token'];

        if (!csrfCookie || !csrfHeader || csrfCookie !== csrfHeader) {
            return res.status(403).json({
                success: false,
                error: 'Forbidden',
                message: 'Invalid CSRF token.'
            });
        }


        const router = createRouter(req, res)
        router.reqData = data || req.body.data || {}
        
        // Get route configs (for middleware)
        const currentRoute = matchCurrentRoute(route)
        
        if (!currentRoute) {
            return res.status(404).json({
                error: 'Route not found',
                message: `Route ${route} does not exist`
            })
        }
        
        const routeConfigs = getRouteConfigs(currentRoute)
        router.param = { ...router.param, ...routeConfigs.params }

        // Rate limiting logic
        if (routeConfigs.rateLimit !== false) { // Allows disabling with `rateLimit: false`
            // Use route-specific limit, or fall back to a default for actions
            const limitConfig = routeConfigs.rateLimit || { limit: 60, windowMs: 60000 };
            
            if (isRateLimited(req, limitConfig.limit, limitConfig.windowMs)) {
                return res.status(429).json({
                    success: false,
                    error: 'Too Many Requests',
                    message: MESSAGES.RATE_LIMIT
                });
            }
        }
        
        // Run global auth middleware
        for (const middleware of globalMiddlewares) {
            const authPassed = await middleware(router);
            if (authPassed === false) {
                if (router.redirectUrl) {
                    return res.json({
                        redirect: router.redirectUrl,
                        status: router.redirectStatus || 302,
                        message: router.redirectMessage,
                        type: router.redirectType
                    })
                }
                
                return res.status(403).json({
                    error: 'Forbidden',
                    message: 'Auth Middleware blocked this action'
                })
            }
        }
        
        // Run middleware chain
        const middlewarePassed = await runMiddlewareChain(routeConfigs, router)
        
        if (!middlewarePassed) {
            // Check if redirect was set
            if (router.redirectUrl) {
                return res.json({
                    redirect: router.redirectUrl,
                    status: router.redirectStatus || 302,
                    message: router.redirectMessage,
                    type: router.redirectType
                })
            }
            
            return res.status(403).json({
                error: 'Forbidden',
                message: 'Middleware blocked this action'
            })
        }
        
        // Execute action
        let actionResult = null
        let actionError = null
        
        try {
            actionResult = await actionHandler(router)
        } catch (error) {
            actionError = error
            console.error(`Action error [${route}:${action}]:`, error)
        }
        
        // Handle redirect
        if (router.redirectUrl) {
            return res.json({
                success: true,
                redirect: router.redirectUrl,
                status: router.redirectStatus || 302,
                data: actionResult,
                message: router.redirectMessage,
                type: router.redirectType
            })
        }
        
        // Handle error
        if (actionError) {
            return res.status(500).json({
                success: false,
                error: 'Action failed',
                message: __pawaDev ? actionError.message : 'Internal server error',
                stack: __pawaDev ? actionError.stack : undefined
            })
        }
        
        // Success response
        return res.json({
            success: true,
            data: actionResult,
            message: router.redirectMessage,
            type: router.redirectType
        })
        
    } catch (error) {
        console.error('Server action handler error:', error)
        
        return res.status(500).json({
            success: false,
            error: 'Internal server error',
            message: __pawaDev ? error.message : 'An error occurred',
            stack: __pawaDev ? error.stack : undefined
        })
    }
}


let clientRouting={}
/**
 * Build route maps from server configurations
 */


async function buildRouteMaps() {
    serverRouteMaps.clear();
    actionsRoute.clear();
    clientRouting = {};

    // Collect auto-generated server configs from the file system routes
    const autoConfigs = []
    const collectConfigs = async (nodes, parentPath = '') => {
        for (const node of nodes) {
            const currentPath = (parentPath + '/' + (node.path || '')).replace(/\/+/g, '/') || '/';
            
            if (node.serverSide) {
                try {
                    // Dynamically import the config file
                    const mod = await node.serverSide()
                    Object.values(mod).forEach(val => {
                        // Check for valid config objects (created via createServerSide)
                        if (val && val.server && val.client) {
                            if (!val.server.route) val.server.route = currentPath;
                            if (!val.client.route) val.client.route = currentPath;
                            autoConfigs.push(val)
                        }
                    })
                } catch (e) {
                    console.error(`Error loading server config for ${node.path}:`, e)
                }
            }
            if (node.children) {
                
                await collectConfigs(node.children, currentPath)
            }
        }
    }
    await collectConfigs(routes, '')
    
    // Merge auto configs with manually registered configs (manual takes precedence if placed last, 
    // but here we simply combine them. 'server' array contains setServerSide calls)
    const allConfigs = [...autoConfigs, ...server]
    // console.log(allConfigs,'all server configs');

    allConfigs.forEach(s => {
        if (!s) {
            console.error("An undefined configuration was passed to setServerSide. Please check your route configurations in main.js.");
            return; // Skip this iteration
        }
        const routesForServer = s.server 
        const client = s.client

        clientRouting[client.route] = client;
        actionsRoute.set(routesForServer.route, routesForServer.actions);

        let getRouteName = routeArray.find(r => r.route === routesForServer.route);

        // If the route is not defined by a page file, create a virtual route entry.
        if (!getRouteName) {
            getRouteName = {
                name: routesForServer.name || routesForServer.route.replace(/[^a-zA-Z0-9]/g, '-'),
                route: routesForServer.route,
                routeNames: [routesForServer.name],
                notfound: ''
            };
            routeArray.push(getRouteName);
            routeMap.set(getRouteName.route, { name: getRouteName.name, load: null });
        }

        const getParentRoute = routeArray.filter(r =>
            getRouteName.routeNames.includes(r.name) && r.route !== routesForServer.route
        );

        serverRouteMaps.set(getRouteName.name, {
            route: routesForServer.route,
            title:routesForServer?.title,
            description:routesForServer?.description,
            action: routesForServer.actions,
            middleware: routesForServer.middleware || [],
            init: routesForServer.init,
            name: routesForServer.name,
            generateParams: routesForServer.generateParams,
            parentRoute: getParentRoute || [],
            rateLimit: routesForServer.rateLimit
        });
    });
}

/**
 * Create router context object
 */
function createRouter(req, res) {
    let redirectData = { url: '', msg: '', status: 0, type: 'info' }
    
    const redirect = (url, msg = "", status = 302, type = 'info') => {
        redirectData.url = url
        redirectData.msg = msg
        redirectData.status = status
        
        redirectData.type = type
    }
    
    const flash = (msg, type = 'success') => {
        redirectData.msg = msg
        redirectData.type = type
    }

    const router = {
        url: req.originalUrl,
        param: req.params || {},
        query: req.query || {},
        redirect,
        redirectUrl: '',
        redirectStatus: 302,
        flash,
        reqData: req.body || {},
        title: '',
        csrfToken: crypto.randomBytes(32).toString('hex'),
        revalidate: async (path = req.originalUrl) => {
            if (!path) return;
            await isrCache.invalidate(path);
        },
        description: '',
        content: '',
        request: req,
        response: res
    }
    
    // Proxy redirect to router object
    Object.defineProperty(router, 'redirectUrl', {
        get: () => redirectData.url,
        enumerable: true
    })
    
    Object.defineProperty(router, 'redirectStatus', {
        get: () => redirectData.status || 302,
        enumerable: true
    })
    
    Object.defineProperty(router, 'redirectMessage', {
        get: () => redirectData.msg,
        enumerable: true
    })

    Object.defineProperty(router, 'redirectType', {
        get: () => redirectData.type,
        enumerable: true
    })

    return router
}

/**
 * Match current route from URL
 */
function matchCurrentRoute(url) {
    let params = {}
    
    const current = routeArray.filter((value) => {
        const [match, param] = matchRoute(value.route, url)
        if (param) {
            Object.assign(params, param)
        }
        return match 
    })
    
    if (current.length === 0) {
        return null
    }
    
    if (current.length > 1) {
        // If multiple routes match (e.g., layout and index page for '/'),
        // prefer the more specific one (the one with more path segments in its name hierarchy).
        current.sort((a, b) => b.routeNames.length - a.routeNames.length);
    }

    return {
        route: current[0],
        params
    }
}

/**
 * Get route configs with parent chain
 */
function getRouteConfigs(currentRoute) {
    const main = currentRoute.route
    let getRouteConfigs = serverRouteMaps.get(main.name) || {
        middleware: [],
        
        parentRoute: [],
        route: main.route,
        name: main.name
    }
    
    // Build parent chain if not already built
    if (getRouteConfigs.parentRoute.length === 0) {
        main.routeNames.forEach(v => {
            if (v === main.name) return
            getRouteConfigs.parentRoute.push({name: v})
        })
    }
    
    // Resolve parent configs
    const parentChain = []
    for (const parent of getRouteConfigs.parentRoute) {
        const parentConfig = serverRouteMaps.get(parent.name)
        if (parentConfig) {
            parentChain.push(parentConfig)
        }
    }
    
    return {
        ...getRouteConfigs,
        parentChain,
        params: currentRoute.params
    }
}

/**
 * Run middleware chain with early exit
 */
async function runMiddlewareChain(routeConfigs, router) {
    // Parent middleware first
    if (routeConfigs.parentChain) {
        for (const parentConfig of routeConfigs.parentChain) {
            if (parentConfig.middleware && parentConfig.middleware.length > 0) {
                for (const middleware of parentConfig.middleware) {
                    const result = await middleware(router)
                    if (result === false) {
                        console.log(`Middleware blocked at parent: ${parentConfig.route}`)
                        return false
                    }
                }
            }
        }
    }
    
    // Route middleware
    if (routeConfigs.middleware && routeConfigs.middleware.length > 0) {
        for (const middleware of routeConfigs.middleware) {
            const result = await middleware(router)
            if (result === false) {
                console.log(`Middleware blocked at route: ${routeConfigs.route}`)
                return false
            }
        }
    }
    
    return true
}

/**
 * Load all route data in parallel with timeout, retry, and cancellation support
 * @param {Object} routeConfigs - Route configuration
 * @param {Object} router - Router context
 * @param {boolean} parentChain - Whether to load parent chain data
 * @param {Object} options - Additional options
 * @returns {Promise<Object>} Route data with success/error states
 */
async function loadRouteData(routeConfigs, router, parentChain = true, options = {}) {
    const {
        timeoutMs = 5000,           // Default timeout
        retryCount = 0,             // Number of retries on failure
        retryDelay = 1000,          // Delay between retries
        abortController = null      // For cancellation support
    } = options;
    
    const dataLoaders = [];
    const routeData = {};
    const abortSignal = abortController?.signal;

    /**
     * Execute function with timeout and optional retry
     */
    const withTimeoutAndRetry = async (fn, route, attempt = 0) => {
        try {
            // Create abortable promise
            const abortPromise = abortSignal ? new Promise((_, reject) => {
                abortSignal.addEventListener('abort', () => reject(new Error('Request aborted')));
            }) : null;
            
            const timeoutPromise = new Promise((_, reject) => {
                const timeoutId = setTimeout(() => {
                    reject(new Error(`Data loading timed out for ${route} after ${timeoutMs}ms`));
                }, timeoutMs);
                
                // Cleanup timeout if the promise resolves first
                if (abortSignal) {
                    abortSignal.addEventListener('abort', () => clearTimeout(timeoutId));
                }
            });
            
            const dataPromise = fn();
            
            // Race between data, timeout, and abort
            let result;
            if (abortPromise) {
                result = await Promise.race([dataPromise, timeoutPromise, abortPromise]);
            } else {
                result = await Promise.race([dataPromise, timeoutPromise]);
            }
            
            return result;
        } catch (error) {
            // Check if we should retry
            if (attempt < retryCount) {
                console.log(`[LoadRouteData] Retrying ${route} (attempt ${attempt + 1}/${retryCount})`);
                await new Promise(resolve => setTimeout(resolve, retryDelay));
                return withTimeoutAndRetry(fn, route, attempt + 1);
            }
            throw error;
        }
    };

    /**
     * Log timing for performance monitoring
     */
    const logTiming = (route, startTime, success) => {
        const duration = Date.now() - startTime;
        if (__pawaDev) {
            console.debug(`[RouteData] ${route} ${success ? 'loaded' : 'failed'} in ${duration}ms`);
        }
    };

    // Collect parent init functions
    if (routeConfigs.parentChain && parentChain) {
        for (const config of routeConfigs.parentChain) {
            if (config.init) {
                const startTime = Date.now();
                routeData[config.route] = { data: {}, error: {}, timing: null };
                
                dataLoaders.push(
                    withTimeoutAndRetry(() => config.init(router), config.route)
                        .then(data => {
                            logTiming(config.route, startTime, true);
                            routeData[config.route] = {
                                data: data || {},
                                error: null,
                                timing: Date.now() - startTime
                            };
                        })
                        .catch(error => {
                            logTiming(config.route, startTime, false);
                            console.error(`[LoadRouteData] Failed for ${config.route}:`, error.message);
                            routeData[config.route] = {
                                data: {},
                                error: {
                                    message: error.message,
                                    code: error.code || 'TIMEOUT',
                                    route: config.route
                                },
                                timing: Date.now() - startTime
                            };
                        })
                );
            }
        }
    }
    
    // Add current route init function
    if (routeConfigs.init) {
        const startTime = Date.now();
        routeData[routeConfigs.route] = { data: {}, error: {}, timing: null };
        
        dataLoaders.push(
            withTimeoutAndRetry(() => routeConfigs.init(router), routeConfigs.route)
                .then(data => {
                    logTiming(routeConfigs.route, startTime, true);
                    routeData[routeConfigs.route] = {
                        data: data || {},
                        error: null,
                        timing: Date.now() - startTime
                    };
                })
                .catch(error => {
                    
                    logTiming(routeConfigs.route, startTime, false);
                    console.error(`[LoadRouteData] Failed for ${routeConfigs.route}:`, error.message);
                    routeData[routeConfigs.route] = {
                        data: {},
                        error: {
                            message: error.message,
                            code: error.code || 'TIMEOUT',
                            route: routeConfigs.route
                        },
                        timing: Date.now() - startTime
                    };
                })
        );
    }
    
    // Run all in parallel with Promise.allSettled (never throws)
    const results = await Promise.allSettled(dataLoaders);
    
    // Log summary
    if (__pawaDev) {
        const totalRoutes = Object.keys(routeData).length;
        const failedRoutes = Object.values(routeData).filter(r => r.error).length;
        console.log(`[LoadRouteData] Loaded ${totalRoutes - failedRoutes}/${totalRoutes} routes successfully`);
        
        // Log slow routes
        Object.entries(routeData).forEach(([route, data]) => {
            if (data.timing && data.timing > 2000) {
                console.warn(`[LoadRouteData] Slow route: ${route} took ${data.timing}ms`);
            }
        });
    }
    
    return routeData;
}
/**
 * Escape HTML to prevent XSS
 */
function escapeHtml(unsafe) {
    if (!unsafe) return ''
    
    return String(unsafe)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;")
}

/**
 * Build metadata HTML
 */
function buildMetadata(router, serializedState) {
    return `
        <title>${escapeHtml(router.title) || 'PawaJS App'}</title>
        <meta name="description" content="${escapeHtml(router.description) || ''}"/>
        <script type="application/json" id="pawa-route-data">
            ${serializedState}
        </script>
    `
}

/**
 * Serialize state safely for client
 */
function serializeState(routeData, routeConfigs) {
    const clientActions = {}
    
    for (const [route, actions] of actionsRoute.entries()) {
        clientActions[route] = Object.keys(actions)
    }
     // Build prefetch metadata
    const prefetchRoutes = buildClientRouteMetadata()
    const stateObject = {
        routeData,
        actions: clientActions,
        clientRouting,
        prefetchRoutes,
        messages: MESSAGES
    }
    
    return JSON.stringify(stateObject)
        .replace(/</g, '\\u003c')
        .replace(/>/g, '\\u003e')
        .replace(/\u2028/g, '\\u2028')  // Line separator
        .replace(/\u2029/g, '\\u2029')  // Paragraph separator
}

/**
 * Send 404 response
 */
function send404(res) {
    res.status(404).send(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>404 - Not Found</title>
            <style>
                body {
                    font-family: system-ui, -apple-system, sans-serif;
                    display: flex;
                    justify-content: center;
                    align-items: center;
                    height: 100vh;
                    margin: 0;
                    background: #f5f5f5;
                }
                .error {
                    text-align: center;
                    padding: 2rem;
                    background: white;
                    border-radius: 8px;
                    box-shadow: 0 2px 8px rgba(0,0,0,0.1);
                }
                h1 { color: #333; margin: 0 0 1rem 0; }
                p { color: #666; }
            </style>
        </head>
        <body>
            <div class="error">
                <h1>404</h1>
                <p>Page not found</p>
            </div>
        </body>
        </html>
    `)
}

/**
 * Send 500 response
 */
function send500(res, error) {
    const isDev = process.env.NODE_ENV === 'development' || __pawaDev
    
    res.status(500).send(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>500 - Internal Server Error</title>
            <style>
                body {
                    font-family: system-ui, -apple-system, sans-serif;
                    padding: 2rem;
                    background: #f5f5f5;
                }
                .error {
                    background: white;
                    border-radius: 8px;
                    padding: 2rem;
                    box-shadow: 0 2px 8px rgba(0,0,0,0.1);
                }
                h1 { color: #d32f2f; margin: 0 0 1rem 0; }
                pre {
                    background: #f5f5f5;
                    padding: 1rem;
                    border-radius: 4px;
                    overflow-x: auto;
                }
            </style>
        </head>
        <body>
            <div class="error">
                <h1>500 - Internal Server Error</h1>
                ${isDev ? `
                    <p>${escapeHtml(error.message)}</p>
                    <pre>${escapeHtml(error.stack)}</pre>
                ` : '<p>Something went wrong</p>'}
            </div>
        </body>
        </html>
    `)
}

/**
 * Handle middleware failure
 */
function handleMiddlewareFailure(res, router) {
    // Check if redirect was set
    if (router.redirectUrl) {
        let url = router.redirectUrl
        if (router.redirectMessage) {
            const separator = url.includes('?') ? '&' : '?'
            url += `${separator}msg=${encodeURIComponent(router.redirectMessage)}`
            url += `&type=${encodeURIComponent(router.redirectType || 'info')}`
        }
        return res.redirect(router.redirectStatus || 302, url)
    }
    
    // Otherwise send 403
    res.status(403).send(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>403 - Forbidden</title>
            <style>
                body {
                    font-family: system-ui, -apple-system, sans-serif;
                    display: flex;
                    justify-content: center;
                    align-items: center;
                    height: 100vh;
                    margin: 0;
                    background: #f5f5f5;
                }
                .error {
                    text-align: center;
                    padding: 2rem;
                    background: white;
                    border-radius: 8px;
                    box-shadow: 0 2px 8px rgba(0,0,0,0.1);
                }
                h1 { color: #333; margin: 0 0 1rem 0; }
                p { color: #666; }
            </style>
        </head>
        <body>
            <div class="error">
                <h1>403</h1>
                <p>Access forbidden</p>
            </div>
        </body>
        </html>
    `)
}

/**
 * Build client-side route metadata
 * Determines which routes need prefetching
 */
function buildClientRouteMetadata() {
    const metadata = {}
    
    routeArray.forEach(route => {
        const serverConfig = serverRouteMaps.get(route.name)
        
        // Check if this route needs data loading
        const hasInit = serverConfig?.init !== undefined
        const hasMiddleware = serverConfig?.middleware?.length > 0
        
        // Check if any parent has middleware
        let parentHasMiddleware = false
        if (route.routeNames.length > 1) {
            for (const parentName of route.routeNames) {
                if (parentName === route.name) continue
                
                const parentConfig = serverRouteMaps.get(parentName)
                if (parentConfig?.middleware?.length > 0) {
                    parentHasMiddleware = true
                    break
                }
            }
        }
        
        // Determine if route needs prefetching
        const needsPrefetch = hasInit || hasMiddleware || parentHasMiddleware
        
        if (needsPrefetch) {
            metadata[route.route] = {
                name: route.name,
                hasInit,
                hasMiddleware,
                parentHasMiddleware,
                routeNames: route.routeNames
            }
        }
    })
    
    return metadata
}
/**
 * Handle route prefetch requests
 * Returns route data without full HTML rendering
 */
export const handleRoutePrefetch = async (req, res) => {
    try {
        // Build route maps if needed
        if (__pawaDev || !routeMapsCached) {
            await buildRouteMaps()
            routeMapsCached = true
        }
        
        const { route, parentRoute=true,params={},actualUrl } = req.body
        
        if (!route) {
            return res.status(400).json({
                error: 'Missing route',
                message: 'Request must include "route" field'
            })
        }
        // Create router context
        const router = createRouter(req, res)
        // If dynamic params were provided, merge them
  if (Object.keys(params).length > 0) {
      // Use the dynamic params for data loading
      router.param = { ...router.param, ...params }
  }
  
  
        
        // Match route
        const currentRoute = matchCurrentRoute(route)
        
        if (!currentRoute) {
            return res.status(404).json({
                error: 'Route not found',
                message: `Route ${route} does not exist`
            })
        }
        
        // Get route configs
        const routeConfigs = getRouteConfigs(currentRoute)
       // router.param = { ...router.param, ...routeConfigs.params }

        // Rate limiting logic
        if (routeConfigs.rateLimit !== false) { // Allows disabling with `rateLimit: false`
            // Use route-specific limit, or fall back to a default for prefetching
            const limitConfig = routeConfigs.rateLimit || { limit: 200, windowMs: 60000 };
            
            if (isRateLimited(req, limitConfig.limit, limitConfig.windowMs)) {
                return res.status(429).json({
                    success: false,
                    error: 'Too Many Requests',
                    message: MESSAGES.RATE_LIMIT
                });
            }
        }
        
        // Run global auth middleware
        for (const middleware of globalMiddlewares) {
            const authPassed = await middleware(router);
            if (authPassed === false) {
                // Middleware blocked - return auth info
                if (router.redirectUrl) {
                    return res.json({
                        success: false,
                        blocked: true,
                        redirect: router.redirectUrl,
                        status: router.redirectStatus || 302,
                        message: router.redirectMessage,
                        type: router.redirectType
                    })
                }
                
                return res.status(403).json({
                    success: false,
                    blocked: true,
                    error: 'Forbidden',
                    message: 'Auth Middleware blocked this route'
                })
            }
        }
        
        // Run middleware chain
        const middlewarePassed = await runMiddlewareChain(routeConfigs, router)
        
        if (!middlewarePassed) {
            // Middleware blocked - return auth info
            if (router.redirectUrl) {
                return res.json({
                    success: false,
                    blocked: true,
                    redirect: router.redirectUrl,
                    status: router.redirectStatus || 302,
                    message: router.redirectMessage,
                    type: router.redirectType
                })
            }
            
            return res.status(403).json({
                success: false,
                blocked: true,
                error: 'Forbidden',
                message: 'Middleware blocked this route'
            })
        }
        
        // Load route data
        const routeData = await loadRouteData(routeConfigs, router,parentRoute)
        routeData.params = router.param
        
        // Return just the data
        return res.json({
            success: true,
            route: route,
            data: routeData,
            user: router.user || null,
            metadata: {
                title: router.title,
                description: router.description
            }
        })
        
    } catch (error) {
        console.error('Route prefetch error:', error)
        
        return res.status(500).json({
            success: false,
            error: 'Internal server error',
            message: __pawaDev ? error.message : 'An error occurred',
            stack: __pawaDev ? error.stack : undefined
        })
    }
}

// ===== MAIN SERVER INITIALIZER =====

/**
 * Main server initializer
 * @param {import('express').Response} res
 * @param {import('express').Request} req
 * @param {string} html
 * @param {object} context
 * @param {function} stream
 * @param {{templateStart:string, templateEnd:string}} options
 */
export const serverIntializer = async (res, req, html, context, stream, {templateBegin,templateStart, templateEnd}) => {
    const path = req.originalUrl.split('?')[0];
    if (path.match(/\.(png|jpg|jpeg|gif|ico|json|css|js|map|woff|woff2|ttf|eot|svg)$/i)) {
        return send404(res)
    }

    // Build route maps (cached in production)
    if (__pawaDev || !routeMapsCached) {
        await buildRouteMaps();
        routeMapsCached = true;
    }

    // Match current route from URL
    const currentRoute = matchCurrentRoute(path);

    // Get render style and revalidation time from the matched route object
    const renderStyle = currentRoute?.route.render || 'ssr'; // Default to SSR
    const revalidateTime = currentRoute?.route.revalidate;   // In seconds

    // --- ISR Cache Handling ---
    if (renderStyle === 'isr' && req.method === 'GET' && revalidateTime) {
        const cacheKey = req.originalUrl;
        const cached = await isrCache.get(cacheKey);
        const now = Date.now();

        // 1. HIT: Serve from cache if valid and not stale
        if (cached && (now < cached.timestamp + (revalidateTime * 1000))) {
            res.setHeader('X-Pawa-Cache', 'HIT');
            return res.send(cached.html);
        }

        // 2. STALE: Serve stale content but trigger revalidation in the background
        if (cached) {
            res.setHeader('X-Pawa-Cache', 'STALE');
            res.send(cached.html);
            // The rest of the function will execute to revalidate the cache,
            // but we won't send a response again at the end.
        } else {
            // 3. MISS: No cache entry exists
            res.setHeader('X-Pawa-Cache', 'MISS');
        }
    }
    // --- End ISR Cache Handling ---

    // --- Static Route Handling ---
    if (renderStyle === 'static') {
        // In production, a static file server (e.g., Nginx, Express.static) should serve
        // pre-built HTML files for static routes before this handler is ever reached.
        // This logic is a fallback and indicates a misconfiguration if hit during a request.
        console.warn(`Warning: A request for a 'static' route (${req.originalUrl}) was handled by the SSR server. This should be served as a static file.`);
    }
    // --- End Static Route Handling ---

    // Create router context
    const router = createRouter(req, res);

    let routeConfigs = currentRoute ? getRouteConfigs(currentRoute) : null;

    // Add params to router
    router.param = { ...router.param, ...routeConfigs?.params };

    // Set CSRF cookie
    const existingHeaders = res.getHeader('Set-Cookie') || [];
    const newHeaders = Array.isArray(existingHeaders) ? existingHeaders : [String(existingHeaders)];
    newHeaders.push(serialize('XSRF-TOKEN', router.csrfToken, {
        path: '/',
        sameSite: 'lax'
    }));
    res.setHeader('Set-Cookie', newHeaders);

    if (routeConfigs) {
        if (routeConfigs.title) router.title = routeConfigs.title;
        if (routeConfigs.description) router.description = routeConfigs.description;
    } else {
        // Handle 404 by finding the nearest notfound boundary
    }

    // Rate limit for SSR requests (300/min - generous for page loads but prevents flooding)
    if (isRateLimited(req, 300)) {
        return res.status(429).send(MESSAGES.RATE_LIMIT);
    }

    // Build route maps (cached in production)
    if (__pawaDev || !routeMapsCached) {
        await buildRouteMaps()
        routeMapsCached = true
    }
    
    // Fallback 404 logic if no route config was found initially
    if (!routeConfigs) {
        res.status(404);
        let p = req.originalUrl.split('?')[0];
        let fallbackFound = false;

        while (true) {
            if (p !== '/' && p.endsWith('/')) p = p.slice(0, -1);
            const matches = routeArray.filter(r => {
                const [m] = matchRoute(r.route, p);
                return m;
            });
            if (matches.length > 0) {
                const best = matches.sort((a,b) => b.routeNames.length - a.routeNames.length)[0];
                if (best.notfound) {
                    const [_, params] = matchRoute(best.route, p);
                    routeConfigs = getRouteConfigs({ route: best, params: params || {} });
                    fallbackFound = true;
                    break;
                }
            }
            if (p === '/' || p === '') break;
            const parts = p.split('/').filter(Boolean);
            parts.pop();
            p = parts.length === 0 ? '/' : '/' + parts.join('/');
        }
        
        if (!fallbackFound) {
            return send404(res);
        }
        router.param = { ...router.param, ...routeConfigs?.params }
    }
    
    try {
        // Run global auth middleware
        for (const middleware of globalMiddlewares) {
            const authPassed = await middleware(router);
            if (authPassed === false) {
                // Auth middleware might have initiated a redirect
                if (router.redirectUrl) {
                    let url = router.redirectUrl;
                    if (router.redirectMessage) url += `?msg=${encodeURIComponent(router.redirectMessage)}&type=${router.redirectType || 'info'}`;
                    return res.redirect(router.redirectStatus || 302, url);
                }
                return handleMiddlewareFailure(res, router);
            }
        }

        // Run middleware chain (with early exit)
        const middlewarePassed = routeConfigs ? await runMiddlewareChain(routeConfigs, router) : true;
        
        if (!middlewarePassed) {
            return handleMiddlewareFailure(res, router)
        }
        
        // Handle redirects
        if (router.redirectUrl) {
            return res.redirect(router.redirectStatus || 302, router.redirectUrl)
        }
        
        // Load all route data in parallel
        const routeData = routeConfigs ? await loadRouteData(routeConfigs, router) : {};
        routeData.params = router.param
        
        // Collect all actions for serialization
        const allAction = {}
        routeData['user'] = router.user || null;
        for (const [key, actions] of actionsRoute.entries()) {
            allAction[key] = actions
            
        }
        if(router?.user){
            routeData['user']=router.user
            
        }
        // Serialize for client
        const serializedState = serializeState(routeData, routeConfigs)
        
        // Build metadata
        const metaData = buildMetadata(router, serializedState)
        stream(templateBegin)

        // --- Caching and Streaming Logic ---
        if (renderStyle === 'isr' && revalidateTime) {
            const chunks = [];
            const cacheStream = (chunk) => {
                chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
            };

            // Render to an in-memory buffer first to cache it
            await startStreamApp(html, { ...context, routeData, allAction, router }, cacheStream, {
                templateStart: templateStart.replace('<!--app-head-->', metaData),
                templateEnd
            });

            const finalHtml = Buffer.concat(chunks).toString('utf-8');

            // Update the persistent Redis cache
            // We pass revalidateTime to Redis as a TTL safeguard
            await isrCache.set(req.originalUrl, {
                html: finalHtml,
                timestamp: Date.now()
            }, revalidateTime);
            
            console.log(`[ISR] Cached route: ${req.originalUrl}`);

            // If we already sent a stale response, we're done.
            if (res.getHeader('X-Pawa-Cache') === 'STALE') {
                return; // Do not send a response again
            }

            // Otherwise, send the newly generated HTML
            return res.send(finalHtml);
        }

        // Default to SSR Streaming for 'ssr' and 'static' (as a fallback)
        await startStreamApp(html, { ...context, routeData, allAction, router }, stream, {
            templateStart: templateStart.replace('<!--app-head-->', metaData),
            templateEnd
        });
        
    } catch (error) {
        console.error('Route error:', error)
        return send500(res, error)
    }
}

/**
 * Renders a given path to an HTML string. Used for static site generation.
 * @param {string} routePath - The URL path to render.
 * @param {object} params - Dynamic route parameters.
 * @param {object} options - Render options including templates and context.
 * @returns {Promise<string>} - The rendered HTML.
 */
async function renderPathToHtml(routePath, params, { html, context, template }) {
    // Mock request/response for headless rendering.
    const req = { originalUrl: routePath, headers: {}, query: {}, params, body: {} };
    const res = { setHeader: () => {}, getHeader: () => {}, status: () => res, send: () => {} };

    const router = createRouter(req, res);
    router.param = params;

    const currentRoute = matchCurrentRoute(routePath);
    if (!currentRoute) {
        throw new Error(`Could not find route configuration for static path: ${routePath}`);
    }
    const routeConfigs = getRouteConfigs(currentRoute);

    // Run global and route-specific middleware to ensure data consistency with SSR.
    for (const middleware of globalMiddlewares) {
        await middleware(router);
    }
    const middlewarePassed = await runMiddlewareChain(routeConfigs, router);
    if (!middlewarePassed) {
        throw new Error(`Middleware failed during static generation for ${routePath}. Redirect was attempted to ${router.redirectUrl || '(unknown)'}.`);
    }

    // Load data via init()
    const routeData = await loadRouteData(routeConfigs, router);
    routeData.params = router.param;
    if (router.user) routeData.user = router.user;

    // Serialize state and build metadata
    const serializedState = serializeState(routeData, routeConfigs);
    const metaData = buildMetadata(router, serializedState);

    // Render the application to an HTML string.
    let appHtml = '';
    try {
        const { toString } = await startApp(
            html,
            {
                ...context,
                url: routePath, // Ensure the renderer knows the current static path
                routeData,
                allAction: Object.fromEntries(actionsRoute), // Pass the full actions map
                router
            },
        );
        appHtml = await toString();
    } catch (renderError) {
        console.error(`[SSG] Critical render error for ${routePath}:`, renderError);
        appHtml = `<div class="error-boundary"><h1>Render Error</h1><p>Check server logs for details.</p></div>`;
    }

    // Assemble the final HTML document using the template.
    const [templateStart, templateEnd] = template.split('<!--app-html-->');
    const finalHtml = templateStart.replace('<!--app-head-->', metaData) +
                      appHtml +
                      templateEnd;

    return finalHtml;
}

/**
 * Renders a path and saves it to a file in the dist directory.
 * @param {string} routePath - The URL path to render.
 * @param {object} params - Dynamic route parameters.
 * @param {object} options - Render options.
 */
async function renderAndSave(routePath, params, options) {
    try {
        const htmlContent = await renderPathToHtml(routePath, params, options);
        
        // Determine the output file path (e.g., /about -> /about/index.html).
        let filePath = path.join(options.distDir, routePath);
        if (routePath.endsWith('/') || path.extname(filePath) === '') {
            filePath = path.join(filePath, 'index.html');
        }
        
        const dir = path.dirname(filePath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        
        fs.writeFileSync(filePath, htmlContent, 'utf-8');
        console.log(`  ✓ Saved ${path.relative(process.cwd(), filePath)}`);
    } catch (error) {
        console.error(`  ✗ Error generating ${routePath}:`, error.message);
    }
}

/**
 * Main function for Static Site Generation (SSG).
 * To be called from a build script after the main build is complete.
 */
export const generateStaticSites = async (options) => {
    const { distDir } = options;
    if (!distDir) {
        throw new Error('`distDir` option is required for static site generation.');
    }

    console.log('\nStarting static site generation...');
    await buildRouteMaps();

    // Load the bundled index.html as the template from the dist directory
    const templatePath = path.join(distDir, 'index.html');
    if (!fs.existsSync(templatePath)) {
        throw new Error(`Could not find bundled index.html at ${templatePath}. Make sure to run the client build first.`);
    }
    const template = fs.readFileSync(templatePath, 'utf-8');

    // Save a clean copy of the template for SSR routes to use later
    fs.writeFileSync(path.join(distDir, 'pawa-template.html'), template);

    const renderOptions = {
        ...options,
        html: `<div id="app"><express-init><div><app></app></div></express-init></div>`,
        context: {},
        template
    };

    // Filter for static routes that actually have a page component to render.
    // This excludes "virtual routes" that only exist for actions.
    const staticRoutes = routeArray.filter(r => r.render === 'static' && r.hasComponent);
    if (staticRoutes.length === 0) {
        console.log('No static routes found to generate.');
        return;
    }

    for (const route of staticRoutes) {
        const routeConfig = serverRouteMaps.get(route.name);

        if (routeConfig && routeConfig.generateParams) {
            console.log(`Generating dynamic pages for: ${route.route}`);
            const paramsList = await routeConfig.generateParams(createRouter({}, {}));
            for (const params of paramsList) {
                const dynamicPath = Object.keys(params).reduce((p, key) => p.replace(`:${key}`, String(params[key])), route.route);
                await renderAndSave(dynamicPath, params, renderOptions);
            }
        } else if (!route.route.includes(':')) {
            console.log(`Generating page for: ${route.route}`);
            await renderAndSave(route.route, {}, renderOptions);
        }
    }

    console.log('Static site generation complete.');
};