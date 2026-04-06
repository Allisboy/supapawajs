import { components, getCurrentContext, html, isResume } from "pawajs"
import { $state, runEffect,setContext,useContext,useInsert, RegisterComponent,useValidateComponent, useInnerContext } from "pawajs"
import {isServer} from 'pawajs/server.js'
import routes from '~pages'
import { ImportComponent } from "./import-component.js"
import { useSupport } from "./serverSide/express-init.js"
import { completeProgress, errorProgress, progress, simulateProgress, updateProgress } from "./progress"


/**
 * @type {Array<{name:string,group:Array<string>,routeNames:Array<string>,route:string}>}
 */
const routeArray=[]
const routeMap=new Map()
const intersetMap=new Map()
const availableRoute=new Map()
export const routeConfigs=()=>[routeArray,routeMap]
// console.log(routes)
/**
 * @typedef {{name:string,routeNames:Array<>,route:string,group:string}} RouteTypes
 */
/**
 * @param {Array<{route:string,next:Array<dRoutes>,group:string,load:()=>ImportNodeOptions}>} dRoutes
 * @param {{name:string,group:Array<string>,routeNames:Array<string>,route:string} | null} parentRoute
 */
const routeEntry=(dRoutes,parentRoute)=>{
    dRoutes.forEach((value) => {
        const path = value.path !== undefined ? value.path : (value.route || '')
        const children = value.children || value.next
        const component = value.component || value.load
        const configRoute={
            name:'',
            route: parentRoute 
                ? `${parentRoute.route === '/' ? '' : parentRoute.route}/${path}`.replace(/\/+$/, '') 
                : path.replace(/\/+$/, ''),
            routeNames:parentRoute?[...parentRoute?.routeNames] :[],
            notfound:'',
            // propagate render style from vite-plugin
            render: value.render,
            revalidate: value.revalidate,
            children: children || []
        }
        configRoute.route = configRoute.route.replace(/\/+/g, '/') || '/'

        const name= value.name || (path.startsWith('/') ? path.slice(1) : path)
        configRoute.name = value.name || (configRoute.route === '/' ? 'index' : name)
        configRoute.notfound=value?.notfound?configRoute.route:parentRoute?.notfound
        configRoute.notfound=configRoute.notfound?configRoute.notfound:''
        configRoute.routeNames.push(configRoute.name)
        if (Array.isArray(children)) {
            routeEntry(children,configRoute)
        }
        routeArray.push(configRoute)
        // Map all necessary loaders and metadata
        routeMap.set(configRoute.route, {
            name: configRoute.name,
            load: component,
            childViews: value.childViews || '',
            notfoundLoad: value.notfound,
            loadingLoad: value.loading,
            error: value.error
        })
    })
} 
/**@param {Array<{route:string,next:Array<dRoutes>,group:string}>} dRoutes */
export const RouterConfig=(dRoutes=[])=>{
    routeEntry(dRoutes)
}
export const matchRoute = (pattern, path) => {
  // Remove trailing slashes for consistency
  const cleanPattern = pattern.replace(/\/$/, '');
  const cleanPath = path.replace(/\/$/, '');
  
  const patternParts = cleanPattern.split('/');
  const pathParts = cleanPath.split('/');
  
  if (patternParts.length !== pathParts.length) {
    
    return [false, {}];
  }
  
  const params = {};
  
  const match = patternParts.every((part, index) => {
    if (part.startsWith(':')) {
      // This is a parameter
      const paramName = part.slice(1);
      params[paramName] = pathParts[index];
      return true;
    }
    return part === pathParts[index];
});

return [match, params];
}
export function enhanceHistoryAPI() {
    const originalPushState = history.pushState;
    const originalReplaceState = history.replaceState;
  
    const event = new Event('pushchange');
    const dispatchPushEvent = () => {
      window.dispatchEvent(event);
    };
    
    history.pushState = function (...args) {
      originalPushState.apply(this, args);
      dispatchPushEvent();
    };
  
    history.replaceState = function (...args) {
        originalReplaceState.apply(this, args);
        dispatchPushEvent();
      };
    window.addEventListener('popstate', () => {
        dispatchPushEvent()
      })
    }
    // console.log(routes);
    const count=$state(0)
    const actualRoute=$state('')
   // In your RouterPlugin:

export const RouterPlugin = () => {
    return {
        attribute: {
            register: [
                {
                    fullName: 'route-link',
                    plugin: (el, attr) => {
                        const func = (e) => {
                            e.preventDefault()
                            
                            const currentPath = window.location.pathname
                            const targetPath = new URL(el.href).pathname
                            
                            // Only push state if path actually changed
                            if (currentPath !== targetPath) {
                                history.pushState({}, '', el.href)
                                requestAnimationFrame(() => window.scrollTo({ top: 0 }));
                            } else {
                                // Same path, different hash - just scroll to element
                                const hash = new URL(el.href).hash
                                if (hash) {
                                    const element = document.querySelector(hash)
                                    if (element) {
                                        element.scrollIntoView({ behavior: 'smooth' })
                                    }
                                }
                            }
                        }
                        
                        el._context.linkRoute = () => { // This function is evaluated on server
                            return el.getAttribute('href') === actualRoute.value?.route
                        }
                        
                        if (el.tagName === 'A' && !isServer()) {
                            el.addEventListener('click', func)
                            el._setUnMount(() => {
                                el.removeEventListener('click', func)
                            })
                            el.setAttribute('rel', 'noopener')
                        }
                    }
                }
            ]
        }
    }
}
// console.log(routes);

let formerRouteNames=[]
const routeContexts=setContext()
const routeContext=setContext()
export const useRouter=()=>useContext(routeContext)
export const useRouteState=()=>useContext(routeContexts)

const routeDataContext = setContext()
 // Progress state for loading bar
 
export const useRouteData = () => useContext(routeDataContext)
const route=$state('')
const loadingRoute=$state({})
const errorRoute=$state({message:''})
export const Router=({children})=>{  
  const { clientRouting, prefetchManager , loadData, flashMessage} = useSupport()
  if(!isServer()){
  prefetchManager.setRouteArray(routeArray)
  }
  const isRoute=$state({
    param:{},
    routeNames:[],
    notfound:'',
    name:'',
    route:'',
    generalNotFound:false
  })
  if(routeArray.length === 0 && routes){
    RouterConfig(routes)
  }
  const loading=$state(false)
  if(isServer()){
        const {url}=useInnerContext()
        route.value = url.split('?')[0]
        console.log(url)
    }else{
        route.value=window.location.pathname
    }
    const navigatorTo=(url)=>{
      Promise.resolve().then(()=>{
        history.pushState({},"",url)
        requestAnimationFrame(() => window.scrollTo({ top: 0 }));
      })
    }
    routeContexts.setValue({route,isRoute,loading})
    routeContext.setValue({current:()=>route.value,param:()=>isRoute.value.param,navigatorTo})
    let latest=''
    let enter=false

    const resolveRoute = (currentMatch) => {
      let extendRoute = []
      let parentFetches = false
      
      if (intersetMap.get(currentMatch.route)) {
          currentMatch.routeNames.forEach(n => extendRoute.push(n))
          
          const truth = currentMatch.routeNames.find((v) => formerRouteNames.includes(v))
          if (!truth) return null

          formerRouteNames.forEach((n) => {
              if (!currentMatch.routeNames.includes(n)) {
                  extendRoute.push(n)
              }
          })
          
          parentFetches = extendRoute.some((value) => formerRouteNames.includes(value))
          formerRouteNames = currentMatch.routeNames
      } else {
          extendRoute = currentMatch.routeNames || []
          parentFetches = extendRoute.some((value) => formerRouteNames.includes(value))
          formerRouteNames = currentMatch.routeNames
      }
      return { extendRoute, parentFetches }
    }

    const handleNotFound = (path) => {
      const arraysOfRoute = path.split('/')
      arraysOfRoute.pop()
      const latestPath = arraysOfRoute.join('/')
      const newParams = {}

      // Use '/' if latestPath is empty to check for root-level 404 handlers
      const searchPath = latestPath === '' ? '/' : latestPath
      
      const matched = routeArray.filter(value => {
          const [match, param] = matchRoute(value.route, searchPath);
          if (param) Object.assign(newParams, param)
          return match
      })
      
      if (matched.length > 0 && matched[0].notfound) {
          isRoute.value = {
              routeNames: matched[0].routeNames || [],
              param: newParams,
              notfound: matched[0].notfound,
              route: '',
              name: '',
              generalNotFound: true
          }
      } else if (latestPath !== '') {
          // Continue searching up the path hierarchy
          handleNotFound(latestPath)
      } else {
          // Exhausted all paths, including root, so use the global fallback
          isRoute.value = {
              routeNames: [],
              param: newParams,
              notfound: '',
              name:'',
              route:'',
              generalNotFound: true
          }
      }
    }

    const init=()=>{
      // console.log('init');
      const newParams = {}
      
      const current = routeArray.filter((value) => {
        const [match,param]=  matchRoute(value.route,route.value);
        if(param){
          Object.assign(newParams,param)
        }
        return match
      })

      if(current.length > 1){
        // If multiple routes match (e.g., layout and index page for '/'),
        // prefer the more specific one (the one with more path segments in its name hierarchy).
        current.sort((a, b) => b.routeNames.length - a.routeNames.length);
      }  
      if (loadingRoute.value[latest]) {
        loadingRoute.value = { ...loadingRoute.value, [latest]: false };
      }
      if (errorRoute.value[latest]) {
        errorRoute.value = { ...errorRoute.value, [latest]: false };
      }
      if(current.length > 0){
        
        latest=current[0].route
        actualRoute.value=current[0]
        const resolved = resolveRoute(current[0])
        if (!resolved) return

        const { extendRoute, parentFetches } = resolved

        if (isServer() || enter === false) {
        isRoute.value={
          routeNames:extendRoute,
          param:newParams,
          notfound:'',
          route:current[0].route,
          name:current[0].name,
          generalNotFound:false
        }
        loadingRoute.value = { ...loadingRoute.value, [current[0].route]: false };
        }else{
          const url=latest
          
          loading.value=true  
           // Start progress simulation
                const stopProgress = simulateProgress(url, () => {
                    updateProgress(100, 'complete', url)
                })
                
                updateProgress(5, 'starting', url)
          const prefetchPromise = prefetchManager.prefetch(route.value, parentFetches, {
                    onDownloadProgress: (p) => {
                        // Update progress with actual download progress
                        const actualProgress = Math.floor(p.progress * 100)
                        updateProgress(Math.max(actualProgress, progress.value.value), 'loading', url)
                    }
                })
                
                loadingRoute.value = { ...loadingRoute.value, [current[0].route]: true };
                
                Promise.all([prefetchPromise])
                    .then(([result]) => {
                        if (result) {
                            if (result.success) {
                                document.title = result.metadata.title
                                // Complete progress
                                stopProgress()
                                updateProgress(100, 'complete', url)
                                completeProgress(url)
                            } else if(result.error){
                              errorRoute.value = { ...errorRoute.value, [result.route]: true };
                            }
                            else {
                                if (result.redirect) {
                                    if (result.message) {
                                        flashMessage.value = { 
                                            message: result.message, 
                                            type: result.type || 'info' 
                                        }
                                    }
                                    stopProgress()
                                    history.pushState({}, '', result.redirect)
                                    return
                                }
                                
                                history.pushState({}, '', '/')
                            }
                        }
                        
                        isRoute.value = {
                            routeNames: extendRoute,
                            param: newParams,
                            notfound: '',
                            route: current[0].route,
                            name: current[0].name,
                            generalNotFound: false
                        }
                        
                        // Clear loading state for this route
                        loadingRoute.value = { ...loadingRoute.value, [current[0].route]: false };
                    })
                    .catch((e) => {
                        console.error('Route navigation error:', e)
                        errorRoute.value = { ...errorRoute.value, [current[0].route]: true };
                        console.log('error o=route');
                        
                        stopProgress()
                        errorProgress(url)
                        flashMessage.value = {
                            message: e.message || 'Failed to load page',
                            type: 'error'
                        }
                    })
                    .finally(() => {
                      stopProgress()
                        loading.value = false
                    })      }
      enter=true
      }else{
        formerRouteNames=[]
        handleNotFound(route.value)
    }
  
  }
  if(isServer())init()
    runEffect(()=>{
        enhanceHistoryAPI();
         const pop=(e) => {
      const newPath = window.location.pathname
    const oldPath = route.value
    
    // Only update if path changed
    if (newPath !== oldPath) {
        route.value = newPath
    }
      
    }
    window.addEventListener('pushchange', pop);
    init()
    },0)
    runEffect(()=>{
      route.value=window.location.pathname
        return ()=>{
            init()   
        }
    },[route])

    return children
}
const routeViewContext=setContext()
const pageContext=setContext()
// console.log(routes)
export const usePage = () => {
    const { data, route, prefetchManager } = useContext(pageContext)
    const { isRoute, route: actualPathState } = useContext(routeContexts)
    const instancePath = actualPathState.value
    const resume = isResume()
    const entry = {}
    runEffect(()=>{
      return () => prefetchManager.clearRoute(instancePath)
    }, [])
    if (isServer() || resume) {
        entry['data'] = data?.data || {}
        entry['error'] = data?.error || null
    } else {
        try {
            const cached = prefetchManager.getCached(actualPathState.value)            
            const routePayload = cached?.data?.[route] || {}
            entry['data'] = routePayload?.data || {}
            entry['error'] = routePayload?.error || null
        } catch (error) {
            console.error('Failed to get page data:', error)
            entry['data'] = {}
        }
    }
    
    return {...entry}
}
// console.log(routeArray);

export const RouteView=({children,path,intercept,guard})=>{
  const {isRoute}=useContext(routeContexts)
  const {routeData,prefetchManager}=useSupport()
  
  const isDynamic=path().includes(':')
  
  let data
  let parent=''
  try {
    const {route}=useContext(routeViewContext)
    parent=route
  } catch (e) {
    
  }
  let dRoutes=path() === '/'?parent+'/':parent+path()
  const myRouteDifinition=routeArray.filter((value)=>value.route === dRoutes)[0]
  loadingRoute.value[dRoutes]=false
  
  const isRouteLoading=()=>loadingRoute.value[dRoutes]
  const isRouteError=()=>errorRoute.value[dRoutes]
  const isRouteErrorFalse=()=>errorRoute.value[dRoutes]=false
  const isRouteToFalse=()=>loadingRoute.value[dRoutes]=false
  if (routeData[dRoutes]) {
    data=routeData[dRoutes]
    if (data.error) {
      errorRoute.value[dRoutes]=true
    }
  }
  
  const underRoute=true
  // console.log(myRouteDifinition,dRoutes);
  pageContext.setValue({data,route:dRoutes,currentRouteDif:myRouteDifinition,prefetchManager})
  const isIntercepted=intercept?.()
  if (isIntercepted && !isServer()) {
    dRoutes=path()
    const {route}=useContext(routeViewContext)
    const getCurrentRoute=routeArray.filter((value)=> value.route === route)
    const current=getCurrentRoute[0].routeNames
    
    const interceptS=myRouteDifinition.routeNames
    current.forEach((r)=>{
      interceptS.push(r)
    })
    runEffect(()=>{
      intersetMap.set(path(),route)
      return()=> {
        intersetMap.delete(path())
      }
    })
  }
  // console.log(path())
  routeViewContext.setValue({route:dRoutes,currentRouteDif:myRouteDifinition})
  const name=routeMap.get(dRoutes) || {name:''}
  const loader=name?.load
  const loadingLoader = name?.loadingLoad 
  const error=name?.error
  if (data?.error) {
    errorRoute.value[dRoutes]=true
  }
  const condition=()=>{
    if (isRoute.value.routeNames.includes(name?.name) && !isRouteError()) {
      if(guard !== undefined && guard?.() === false) return 
      if (!isIntercepted && !intersetMap.get(dRoutes)) {
        return true
      }else if (isIntercepted && intersetMap.get(dRoutes)) {
        return true
      }else{
       return false
      }
    }else{
      return false
    }
  }

  const routeKey = () => {
    if (!isDynamic) return dRoutes;
    const paramKeys = path().match(/:[a-zA-Z0-9_$]+/g) || [];
    const paramValues = paramKeys.map(pk => isRoute.value.param[pk.slice(1)] || '').join('-');
    return `${dRoutes}-${paramValues}`;
  }

   useInsert({condition,loader,underRoute,loadingLoader,error,isRouteErrorFalse,isRouteLoading,isRouteToFalse,isRouteError, routeKey})
  return html `
    <template >
      ${loadingLoader ? html `
        <route-loading if="isRouteLoading()" :route="'${dRoutes}'"></route-loading>
        `:''}
      ${error ? html `
        <route-error if="isRouteError()" :route="'${dRoutes}'"></route-error>
        `:''}
      
      <import-component if="condition()" ${isDynamic? 'key="routeKey()"':''} :imports="loader" :loading="isRouteToFalse" >
        ${children}
        ${name?.childViews || ''}
      </import-component>
   
    </template>
  `
}
export const RouteLoading=async({route,children})=>{
  const dRoutes=route()
  const routeIsLoading=()=>loadingRoute.value[dRoutes]
  const name=routeMap.get(dRoutes) || {name:''}
  const loader=name?.loadingLoad
  const {Loading}=await loader()
  const LoadingRouteComponent=()=>Loading()
  RegisterComponent(LoadingRouteComponent)
    return html `
    <div>
      <loading-route-component></loading-route-component>
    </div>
    `
}
export const RouteError=async({route})=>{
  const dRoutes=route()
  const name=routeMap.get(dRoutes) || {name:''}
  const loader=name?.error
  const {Error}=await loader()
  const ErrorRouteComponent=()=>Error()
  RegisterComponent(ErrorRouteComponent)
  
  const reFresh=()=>{ 
    route.value=window.location.pathname
  }
  useInsert({reFresh})
    return html `
    <div>
      <error-route-component :re-fresh="reFresh"></error-route-component>
    </div>
    `
}
export const NotFound = ({ path, children }) => {
    const { isRoute } = useContext(routeContexts);
    const context = useInnerContext();

    const condition = () => {
        const targetPath = path();
        
        // 1. Explicit path match (e.g. <not-found path="/admin">)
        if (targetPath) {
            return isRoute.value.notfound === targetPath;
        }

        // 2. Local RouteView boundary match
        // If we are inside a RouteView, check if this is the active 404 boundary for this scope
        if (context?.underRoute) {
            try {
                const viewContext = useContext(routeViewContext);
                if (viewContext && viewContext.route === isRoute.value.notfound) {
                    return true;
                }
            } catch (e) {
                // Not inside a view context
            }
        }

        // 3. Global Fallback
        // Show if no route was matched at all and no specific boundary caught it
        return isRoute.value.generalNotFound && isRoute.value.notfound === '';
    };

    const getLoader = () => {
        const route = isRoute.value.notfound;
        // Return the specific 404.js loader if it exists, otherwise a no-op promise
        return (route && routeMap.get(route)?.notfoundLoad) || (() => Promise.resolve());
    };

    useInsert({ 
        condition, 
        func: getLoader() 
    });

    return html `
        <template if="condition()">
            <import-component :imports="func">
                ${children || html`
                    <div class="flex flex-col items-center justify-center min-h-[60vh] p-6 text-center">
                        <div class="bg-gray-100 p-6 rounded-full mb-6">
                            <svg class="w-16 h-16 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.172 9.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                            </svg>
                        </div>
                        <h1 class="text-4xl font-bold text-gray-800 mb-2">Page Not Found</h1>
                        <p class="text-gray-500 mb-8 max-w-md">We couldn't find the page you're looking for. It might have been moved or deleted.</p>
                        <a href="/" route-link class="px-8 py-3 bg-blue-600 text-white font-semibold rounded-xl shadow-md hover:bg-blue-700 transition-all transform hover:scale-105">
                            Go back home
                        </a>
                    </div>
                `}
            </import-component>
        </template>
    `;
}

useValidateComponent(NotFound,{
  path:{
    default:false,
    type:String
  }
})

RegisterComponent(ImportComponent,RouteLoading,RouteError,NotFound)