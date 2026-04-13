import { setContext, useContext, useInnerContext,isResume, useServer, $state, runEffect } from "pawajs";
import { isServer } from "pawajs/server.js";
import { PrefetchManager } from './PreFetchManager.js'
import { user } from "./store.js";

const actionContext = setContext();
const supportRouting=setContext()

/**
 * Safe JSON parse for <script type="application/json"> blocks.
 */
const parseJsonScript = (id) => {
  const el = document.getElementById(id);
  if (!el) return null;
  try {
    return JSON.parse(el.textContent || "{}");
  } catch (e) {
    return null;
  }
};

/**
 * Creates a preconfigured axios instance that works both on server and client.
 *
 * Features:
 * - baseURL (optional): from router + request host on server, or from env on client
 * - carries cookies on server (SSR) so auth sessions work
 * - `withCredentials` enabled on client
 * - normalizes errors into a predictable shape
 * - handles global error messages for rate limits and timeouts
 *
 * @param {{router?: any, baseURL?: string, messages?: object}} opts
 */
export const createAxios = (opts = {}) => {
  const { router, baseURL, messages } = opts;
  const clientBaseURL =
    (typeof import.meta !== "undefined" &&
      import.meta.env &&
      import.meta.env.APP_URL) ||
    "";

  const base = baseURL || (isServer() ? "" : clientBaseURL);

  const request = async (url, config = {}) => {
    let fullUrl = url.startsWith('http') ? url : `${base}${url}`;
    const headers = { ...config.headers, "X-Requested-With": "XMLHttpRequest" };

    // Server-side context (SSR)
    if (isServer() && router?.req && !url.startsWith('http')) {
        const req = router.req;
        const proto = req.headers["x-forwarded-proto"] || "http";
        const host = req.headers["x-forwarded-host"] || req.headers.host;
        if (!base) fullUrl = `${proto}://${host}${url}`;
        if (req.headers.cookie) headers["cookie"] = req.headers.cookie;
    }

    // Client-side CSRF
    if (!isServer()) {
        const method = (config.method || 'GET').toUpperCase();
        if (['POST', 'PUT', 'DELETE', 'PATCH'].includes(method)) {
            const token = document.cookie.split('; ').find(row => row.trim().startsWith('XSRF-TOKEN='))?.split('=')[1];
            if (token) headers['X-CSRF-TOKEN'] = token;
        }
    }

    // Handle Request Body
    if (config.body && !(config.body instanceof FormData) && typeof config.body === 'object') {
        config.body = JSON.stringify(config.body);
        headers['Content-Type'] = 'application/json';
    }

    try {
        const response = await fetch(fullUrl, {
            ...config,
            headers,
            credentials: isServer() ? 'omit' : 'include'
        });

        const isJson = response.headers.get('content-type')?.includes('application/json');
        const data = isJson ? await response.json() : await response.text();

        if (!response.ok) {
            const status = response.status;
            let message = (data && (data.message || data.error)) || response.statusText || "Request failed";
            
            if (messages) {
                if (status === 429 && messages.RATE_LIMIT) message = messages.RATE_LIMIT;
                else if (status === 408 && messages.TIMEOUT) message = messages.TIMEOUT;
            }

            throw { ok: false, status, message, data, url: fullUrl, method: config.method || 'GET' };
        }

        return { data, status: response.status };
    } catch (err) {
        if (err.ok === false) throw err;
        throw { ok: false, status: 0, message: err.message || "Request failed", url: fullUrl };
    }
  };

  return {
    get: (url, config) => request(url, { ...config, method: 'GET' }),
    post: (url, data, config) => request(url, { ...config, method: 'POST', body: data }),
  };
};

/**
 * Setup automatic link prefetching
 */
function setupLinkPrefetching(prefetchManager) {
    // Prefetch on hover
    document.addEventListener('mouseover', (e) => {
        const link = e.target.closest('a[route-link]')
        if (link && link.href) {
            const route = new URL(link.href).pathname
            prefetchManager.prefetchOnHover(route)
        }
    })

    // Prefetch visible links after page load
    window.addEventListener('load', () => {
        const links = document.querySelectorAll('a[route-link]')
        prefetchManager.prefetchVisible(Array.from(links))
    })
}
export const ExpressInit = ({ children }) => {
  let actions;
  let routeData;
  let request;
  let clientRouting
  let prefetchManager
  let prefetchRoutes
  let messages = {}
  const flashMessage = $state(null)
  const query = $state({})
  const params = $state({})
 
  if (!isServer()) {
      // Check for msg in query params (SSR redirect handling)
      const urlParams = new URLSearchParams(window.location.search)
      if (urlParams.has('msg')) {
          flashMessage.value = {
              message: urlParams.get('msg'),
              type: urlParams.get('type') || 'info'
          }
          const newUrl = window.location.pathname + window.location.hash
          history.replaceState({}, '', newUrl)
      }
  }

  if (isServer()) {
    const { routeData: rd, allAction, router } = useInnerContext();
    routeData = rd;
    actions = allAction;
    request = router;
    user.value = routeData.user || null
    query.value = router.query || {}
    params.value = router.param || {}
  } else {
    const parsed = parseJsonScript("pawa-route-data") || {};
    routeData = parsed.routeData || {};
    actions = parsed.actions || {};
    clientRouting=parsed.clientRouting || {}
    prefetchRoutes=parsed.prefetchRoutes || {}
    messages = parsed.messages || {}
    user.value = routeData.user || null
    params.value = routeData.params || {}

    const urlParams = new URLSearchParams(window.location.search)
    const queryObject = {}
    for (const [key, value] of urlParams.entries()) {
        // This doesn't handle array-like queries (e.g. ?a=1&a=2), but it's a solid start.
        queryObject[key] = value
    }
    query.value = queryObject
    
    
  }
  
  runEffect(() => {
    if (isServer()) return;
    const updateQuery = () => {
        const urlParams = new URLSearchParams(window.location.search)
        const queryObject = {}
        for (const [key, value] of urlParams.entries()) {
            queryObject[key] = value
        }
        query.value = queryObject
    }
    window.addEventListener('popstate', updateQuery)
    window.addEventListener('pushchange', updateQuery)
    return () => {
        window.removeEventListener('popstate', updateQuery)
        window.removeEventListener('pushchange', updateQuery)
    }
  })

  const http = createAxios({ router: request, messages });
  if (!isServer()) {
     // Create prefetch manager
        prefetchManager = new PrefetchManager(http, prefetchRoutes)
        
        // Setup link hover prefetching
        // setupLinkPrefetching(prefetchManager)
 
    }

  supportRouting.setValue({clientRouting,prefetchManager,routeData,http, flashMessage, user, query, params})
  actionContext.setValue({ actions, request, routeData, http, flashMessage });
  return children;
};

export const useSupport=()=>useContext(supportRouting)

export const useFlash = () => {
    const { flashMessage } = useContext(supportRouting)
    return {
        message: flashMessage,
        show: (msg, type = 'success') => {
            flashMessage.value = { message: msg, type }
        },
        clear: () => {
            flashMessage.value = null
        }
    }
}



export const useQuery = () => {
    const { query } = useContext(supportRouting)
    return query
}

export const useParams = () => {
    const { params } = useContext(supportRouting)
    return params
}

/**
 * @template {Record<string, (ctx: any) => Promise<any>>} [T=Record<string, any>]
 * @typedef {Object} ActionInstance
 * @property {{ [K in keyof T]: (payload?: any) => ReturnType<T[K]> }} action - The callable server actions
 * @property {import('axios').AxiosInstance} http - Axios instance
 * @property {any} routeData - Data for the current route
 * @property {any} request - Request context (server only)
 * @property {import('pawajs').State<Partial<Record<keyof T, boolean>>>} loading - Reactive loading states
 * @property {import('pawajs').State<Partial<Record<keyof T, any>>>} error - Reactive error states
 */

/**
 * Access server actions for a specific route with full IDE type support.
 * 
 * @template {Record<string, (ctx: any) => Promise<any>>} [T=Record<string, any>]
 * @param {string | { 
 *  server: { route: string, actions: T }, 
 *  client: { route: string, actions: string[] } 
 * }} urlOrConfig - Route URL or the config object from createServerSide
 * @returns {ActionInstance<T>}
 */
export const useActions = (urlOrConfig) => {
    const isConfigObject = urlOrConfig && typeof urlOrConfig === 'object' && (urlOrConfig.server || urlOrConfig.client);
    
    let url;
    let clientActionNames = [];

    if (isConfigObject) {
        // If it's the result of createServerSide, extract from client property
        url = urlOrConfig.client.route;
        clientActionNames = urlOrConfig.client.actions;
    } else {
        // Otherwise, it's a string URL
        url = urlOrConfig;
    }

    const resume = isResume()
    const {getServerData,setServerData}=useServer()
    const { actions, request, routeData, http, flashMessage } = useContext(actionContext)
    const action = /** @type {any} */ ({})
    const loading = /** @type {any} */ ($state({}))
    const error = /** @type {any} */ ($state({}))
    
    // On server, `actions` (from actionContext) contains the actual functions.
    // On client, `actions` (from actionContext) contains an array of names (from ~actions virtual module).
    // If `urlOrConfig` was a config object, `clientActionNames` already has the names.
    const actionNames = isServer() 
        ? Object.keys(actions?.[url] || {}) // Server-side, get actual function names from context
        : (isConfigObject ? clientActionNames : (actions?.[url] || [])); // Client-side, use clientActionNames if config object, else use ~actions map
    
    for (const actionName of actionNames) {
        if (isServer()) {
            // Server-side: actions are functions
            const serverActions = actions[url]
            
            action[actionName] = async (payload = {}) => {
                if (typeof serverActions[actionName] === 'function') {
                    
                    const data= await serverActions[actionName]({
                        ...request,
                        reqData: payload
                    })   
                    const serializer={}
                    serializer[actionName]=data                 
                    setServerData(serializer)
                    return data
                }
            }
        } else {
            // Client-side: make HTTP request
            action[actionName] = async (payload = {}) => {    
                if (getServerData()[actionName]) {
                    const data = getServerData()[actionName]
                    delete getServerData()[actionName]
                    return data
                }
                loading.value = { ...loading.value, [actionName]: true }
                error.value = { ...error.value, [actionName]: null }
                try {
                    // On static pages, the CSRF cookie might be missing. 
                    // Fetch it if necessary before the first state-changing request.
                    const hasToken = document.cookie.split('; ').some(row => row.trim().startsWith('XSRF-TOKEN='));
                    if (!hasToken) {
                        await http.get('/_csrf');
                    }

                    let requestData;
                    // Automatically detect and handle FormData for file uploads
                    if (typeof FormData !== 'undefined' && payload instanceof FormData) {
                        payload.append('route', url);
                        payload.append('action', actionName);
                        requestData = payload;
                    } else {
                        requestData = {
                            route: url,
                            action: actionName,
                            data: payload
                        };
                    }

                    const response = await http.post('/_action', requestData)
                    
                    if (response.data.message) {
                        flashMessage.value = {
                            message: response.data.message,
                            type: response.data.type || 'success'
                        }
                    }

                    // Handle redirect
                    if (response.data.redirect) {
                        history.pushState({},'',response.data.redirect)
                    }
                    
                    return response.data.data
                    
                } catch (err) {
                    error.value = { ...error.value, [actionName]: err }
                    // Handle error messages from server (e.g. 400/500 responses)
                    if (err.data && err.data.message) {
                        flashMessage.value = {
                            message: err.data.message,
                            type: err.data.type || 'error'
                        }
                    }
                    throw err
                } finally {
                    loading.value = { ...loading.value, [actionName]: false }
                }
            }
        }
    }
    return { action, http, routeData, request, loading, error }
}
