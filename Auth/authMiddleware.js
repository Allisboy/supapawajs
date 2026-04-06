

/**
 * Auth middleware - loads session into router context
 */
export const authMiddleware = (authProvider) => {
    return async (router) => {
        const authHelpers = {
            // Helper methods
            login: async (userData) => {
                const sessionData = {
                    user: userData,
                    createdAt: Date.now()
                }
                await authProvider.createSession(router.response, sessionData)
                router.user = userData
                router.session = sessionData
            },
            
            logout: async () => {
                await authProvider.destroySession(router.request, router.response)
                router.user = null
                router.session = null
            },
            
            update: async (userData) => {
                const sessionData = {
                    user: userData,
                    updatedAt: Date.now()
                }
                await authProvider.updateSession(router.request, router.response, sessionData)
                router.user = userData
                router.session = sessionData
            }
        }

        try {
            // Get session from request
            const session = await authProvider.getSession(router.request)

            // Add to router context
            router.session = session
            router.user = session?.user || null
            router.auth = {
                isAuthenticated: !!session?.user,
                user: session?.user || null,
                ...authHelpers
            }

            // Auto-refresh session
            if (session) {
                await authProvider.touchSession(router.request)
            }

            return true // Allow request to continue

        } catch (error) {
            console.error('Auth middleware error:', error)
            router.session = null
            router.user = null
            router.auth = { 
                isAuthenticated: false, 
                user: null,
                ...authHelpers
            }
            return true // Don't block request on error
        }
    }
}

/**
 * Require auth middleware - blocks unauthenticated requests
 */
export const requireAuth = (redirectTo = '/login') => {
    return async (router) => {
        if (!router.auth?.isAuthenticated) {
            router.redirect(redirectTo,'Not Authenticated! Please log in')
            return false // Block request
        }

        return true // Allow request
    }
}
/**
 * Require email verified
 */
export const verifiedEmail=(redirectTo='/settings')=>{
    return async (router)=>{
        if(!router.user.emailVerification){
            router.redirect(redirectTo,"Email not verified! Please verify your email")
        }
    }
}
/**
 * Require role middleware
 */
export const requireRole = (...roles) => {
    return async (router) => {
        if (!router.auth?.isAuthenticated) {
            router.redirect('/login')
            return false
        }

        const userRoles = router.auth.user?.roles ||
                          router.auth.user?.labels ||  // Appwrite uses labels
                          []

        const hasRole = roles.some(role => userRoles.includes(role))

        if (!hasRole) {
            router.redirect('/403', 'Access denied', 302, 'error')
            return false
        }

        return true
    }
}

/**
 * Redirect if authenticated middleware - for guest-only pages like login/signup.
 * If the user is logged in, they will be redirected.
 * @param {string} redirectTo - The path to redirect to if the user is authenticated. Defaults to '/'.
 */
export const redirectIfAuth = (redirectTo = '/') => {
    return async (router) => {
        if (router.auth?.isAuthenticated) {
            router.redirect(redirectTo);
            return false; // Block request
        }
        return true; // Allow request
    };
};