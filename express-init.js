import axios from "axios";
import { setContext, useContext, useInnerContext,isResume, useServer, $state } from "pawajs";
import { isServer } from "pawajs/server";
import { PrefetchManager } from '../PreFetchManager.js'
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

  // Client-side baseURL can be provided via Vite env or left empty (same-origin).
  const clientBaseURL =
    (typeof import.meta !== "undefined" &&
      import.meta.env &&
      import.meta.env.VITE_API_BASE_URL) ||
    "";

  const instance = axios.create({
    baseURL: baseURL || (isServer() ? "" : clientBaseURL),
    withCredentials: !isServer(),
    headers: {
      "X-Requested-With": "XMLHttpRequest",
    },
  });

  // Attach cookies/host on server to support SSR auth.
  if (isServer() && router?.req) {
    const req = router.req;
    const proto = req.headers["x-forwarded-proto"] || "http";
    const host = req.headers["x-forwarded-host"] || req.headers.host;

    if (!instance.defaults.baseURL) {
      instance.defaults.baseURL = `${proto}://${host}`;
    }

    const cookie = req.headers.cookie;
    if (cookie) {
      instance.defaults.headers.common["cookie"] = cookie;
    }
  }

  // Client-side: Add CSRF token to state-changing requests
  if (!isServer()) {
    instance.interceptors.request.use(config => {
        if (['post', 'put', 'delete', 'patch'].includes(config.method.toLowerCase())) {
            const token = document.cookie.split('; ').find(row => row.startsWith('XSRF-TOKEN='))?.split('=')[1];
            if (token) {
                config.headers['X-CSRF-TOKEN'] = token;
            }
        }
        return config;
    });
  }

  instance.interceptors.response.use(
    (res) => res,
    (err) => {
      const status = err?.response?.status || 0;
      const data = err?.response?.data;
      let message =
        (data && (data.message || data.error)) ||
        err?.message ||
        "Request failed";

      // Apply global messages if available
      if (messages) {
        if (status === 429 && messages.RATE_LIMIT) {
          message = messages.RATE_LIMIT;
        } else if ((status === 408 || err.code === 'ECONNABORTED') && messages.TIMEOUT) {
          message = messages.TIMEOUT;
        }
      }

      const normalized = {
        ok: false,
        status,
        message,
        data,
        url: err?.config?.url,
        method: err?.config?.method,
      };

      return Promise.reject(normalized);
    }
  );

  return instance;
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
 */

/**
 * Access server actions for a specific route with full IDE type support.
 * 
 * @template {Record<string, (ctx: any) => Promise<any>>} [T=Record<string, any>]
 * @param {string | { server: { route: string, actions: T } }} urlOrConfig - Route URL or the config object from createServerSide
 * @returns {ActionInstance<T>}
 */
export const useActions = (urlOrConfig) => {
    const isConfig = urlOrConfig && typeof urlOrConfig === 'object' && urlOrConfig.server;
    const url = isConfig ? urlOrConfig.server.route : urlOrConfig;

    const resume = isResume()
    const {getServerData,setServerData}=useServer()
    const { actions, request, routeData, http, flashMessage } = useContext(actionContext)
    const action = /** @type {any} */ ({})
    const loading = /** @type {any} */ ($state({}))
    /**
     * @type {Array<string>}
     */
    const all = actions?.[url] || []
    const actionNames = isServer() ? Object.keys(all) : all;
    
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
                try {
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
                    
                } catch (error) {
                    // Handle error messages from server (e.g. 400/500 responses)
                    if (error.data && error.data.message) {
                        flashMessage.value = {
                            message: error.data.message,
                            type: error.data.type || 'error'
                        }
                    }
                    throw error
                } finally {
                    loading.value = { ...loading.value, [actionName]: false }
                }
            }
        }
    }
    return { action, http, routeData, request, loading, error }
}
