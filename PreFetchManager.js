import { loadingCount } from "./serverSide/store"
import { matchRoute } from "./index.js" // Import your route matching function

// supapawajs prefetch
class PrefetchManager {
    constructor(http, prefetchRoutes, routeArray = []) {
        this.http = http
        this.prefetchRoutes = prefetchRoutes
        this.routeArray = routeArray // Store all routes for dynamic matching
        this.cache = new Map()
        this.pending = new Map()
        this.isActive = new Set()
    }
    setRouteArray(routeArray) {
        this.routeArray = routeArray
    }
    /**
     * Check if route needs prefetching (supports dynamic routes)
     * @param {string} route - The actual URL path (e.g., /view/listings/123)
     * @returns {boolean}
     */
    shouldPrefetch(route) {
        // First, check exact match in static routes
        if (this.prefetchRoutes.hasOwnProperty(route)) {
            return true
        }
        
        // Then, check dynamic route patterns
        const matchedRoute = this._matchDynamicRoute(route)
        if (matchedRoute) {
            // Check if the matched pattern needs prefetching
            return this.prefetchRoutes.hasOwnProperty(matchedRoute.pattern)
        }
        
        return false
    }

    /**
     * Get the dynamic route pattern that matches this URL
     * @param {string} url - The actual URL path
     * @returns {Object|null} - { pattern, params } or null
     */
    _matchDynamicRoute(url) {
        for (const route of this.routeArray) {
            const [matches, params] = matchRoute(route.route, url)
            if (matches) {
                return { pattern: route.route, params }
            }
        }
        return null
    }

    /**
     * Get dynamic route config for a URL
     * @param {string} url - The actual URL path
     * @returns {Object|null} - Route config or null
     */
    _getDynamicRouteConfig(url) {
        for (const route of this.routeArray) {
            const [matches, params] = matchRoute(route.route, url)
            if (matches) {
                return { ...route, params }
            }
        }
        return null
    }

    /**
     * Get cached data for route (supports dynamic routes)
     * @param {string} route - URL path
     * @returns {any}
     */
    getCached(route) {
        // Try exact match first
        if (this.cache.has(route)) {
            return this.cache.get(route)
        }
        
        // Only try dynamic pattern fallback if the route is NOT dynamic (static fallback)
        const matchedRoute = this._matchDynamicRoute(route)
        if (matchedRoute && matchedRoute.pattern === route) {
            const cacheKey = matchedRoute.pattern
            const cached = this.cache.get(cacheKey)
            if (cached) {
                return cached
            }
        }
        
        return null
    }

    /**
     * Prefetch route data (supports dynamic routes)
     * @param {string} route - URL path
     * @param {boolean} parentRouteFetch - Whether to fetch parent routes
     * @param {Object} options - Additional options
     * @returns {Promise<any>}
     */
    async prefetch(route, parentRouteFetch = false, options = {}) {
        // First, try to match dynamic route pattern
        const dynamicRoute = this._matchDynamicRoute(route)
        const effectiveRoute = dynamicRoute ? dynamicRoute.pattern : route
        
        // Check if already cached under pattern or exact URL
        if (this.cache.has(route)) {
            return this.cache.get(route)
        }
        
        // Already pending
        if (this.pending.has(route) || this.pending.has(effectiveRoute)) {
            const pendingPromise = this.pending.get(route) || this.pending.get(effectiveRoute)
            return pendingPromise
        }

        // Check if needs prefetch
        if (!this.shouldPrefetch(route)) {
            return null
        }

        // Determine parent route behavior
        const parentRoute = parentRouteFetch ? true : false
        
        // Build request payload with dynamic params if available
        const payload = { 
            route: effectiveRoute, 
            parentRoute 
        }
        
        // Add dynamic params to the request if this is a dynamic route
        if (dynamicRoute && dynamicRoute.params) {
            payload.params = dynamicRoute.params
            payload.actualUrl = route
        }

        // Start prefetch with progress tracking
        const promise = this.http
            .post('/_prefetch', payload, options)
            .then(response => {
                const data = response.data

                // Check if blocked by middleware
                if (data.blocked) {
                    if (data.redirect) {
                        // Will redirect on navigation
                    }
                    return data
                }
                
                
                // Cache under both pattern and exact URL
                // this.cache.set(effectiveRoute, data)
                if (data?.data[data.route]?.error) {
                    return {
                        error:data.data[data.route].error.message,
                        data:data,
                        route:data.route
                    }
                }else{
                    this.cache.set(route, data) // Cache by specific URL instance
                }
                
                return data
            })
            .catch(error => {
                console.error(`❌ Prefetch failed: ${route}`, error)
                return error.data
            })
            .finally(() => {
                this.pending.delete(route)
                this.pending.delete(effectiveRoute)
            })

        this.pending.set(route, promise)
        this.pending.set(effectiveRoute, promise)
        return promise
    }

    /**
     * Prefetch route on hover/mouseenter (supports dynamic routes)
     * @param {string} route - URL path
     */
    prefetchOnHover(route) {
        if (!this.shouldPrefetch(route)) return

        const cacheKey = this._matchDynamicRoute(route)?.pattern || route
        
        if (!this.cache.has(cacheKey) && !this.pending.has(cacheKey)) {
            // Delay slightly to avoid prefetching accidental hovers
            setTimeout(() => this.prefetch(route), 100)
        }
    }

    /**
     * Prefetch visible links (intersection observer)
     * @param {Array} links - Array of link elements
     */
    prefetchVisible(links) {
        if (!('IntersectionObserver' in window)) return

        const observer = new IntersectionObserver(
            (entries) => {
                entries.forEach(entry => {
                    if (entry.isIntersecting) {
                        const href = entry.target.getAttribute('href')
                        if (href) {
                            this.prefetchOnHover(href)
                            observer.unobserve(entry.target)
                        }
                    }
                })
            },
            {
                rootMargin: '50px' // Start prefetching 50px before visible
            }
        )

        links.forEach(link => observer.observe(link))
    }

    /**
     * Clear specific route from cache (supports dynamic routes)
     * @param {string} route - URL path
     */
    clearRoute(route) {
        const dynamicRoute = this._matchDynamicRoute(route)
        const pattern = dynamicRoute ? dynamicRoute.pattern : route
        
        this.cache.delete(route)
        this.cache.delete(pattern)
        this.pending.delete(route)
        this.pending.delete(pattern)
    }

    /**
     * Clear all cache
     */
    clear() {
        this.cache.clear()
        this.pending.clear()
    }
}

export { PrefetchManager }