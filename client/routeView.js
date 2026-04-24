import { html, isResume, runEffect, setContext, useContext, useInsert } from "pawajs"
import { errorRoute, intersetMap, loadingRoute, prefetchControl, routeArray, routeContext, routeContexts, routeMap, activePages } from "./router.js"
import { useSupport } from "../express-init.js"
import { isServer } from "pawajs/server.js"


export const routeViewContext=setContext()
const pageContext=setContext()
export const usePage = () => {
    const { data, route, prefetchManager,currentRouteDif } = useContext(pageContext)
    const { isRoute, route: actualPathState } = useContext(routeContexts)
    const { flashMessage } = useSupport()
    const page=$state({})
    const instancePath = actualPathState.value
    console.log(route);
    if (!isServer()) {
      activePages[route]=page
    }
    const resume = isResume()
    const entry = {}
    
    const name=currentRouteDif.name
    runEffect(()=>{      
      console.log(prefetchManager.getCached(instancePath));
      let clear
      return () => {
        clear=setTimeout(() => {
          if (activePages[route]) {
            delete activePages[route]
          }
          if (prefetchManager.getCached(instancePath)) {
            prefetchManager.clearRoute(instancePath)
          }
         else if (!isRoute.value.routeNames.includes(name)) {
            prefetchManager.clearRoute(instancePath)
          }
          clearTimeout(clear)
        }, 6000);
      }
    })
    if (isServer() || resume) {
        entry['data'] = data?.data || {}
        page.value={...entry['data']}
        entry['error'] = data?.error || null
    } else {
        try {
            const cached = prefetchManager.getCached(actualPathState.value)   
            const routePayload = cached?.data?.[route] || {}
            entry['data'] = routePayload?.data || {}
            entry['error'] = routePayload?.error || null
            page.value={...entry['data']}
        } catch (error) {
            console.error('Failed to get page data:', error)
            entry['data'] = {}
        }
    }
     
    return {page}
}
export const revalidate=async(url,parent=false)=>{
  let current
  const {prefetchManager,flashMessage}=useSupport()
  try {
    const {route}=useContext(pageContext)
    current=route
  } catch (error) {
  }
  if (url) current=url
  if (prefetchManager.getCached(current)) {
    prefetchManager.clearRoute(current)
  }

  await prefetchControl(prefetchManager,{value:current},parent,false,current,flashMessage,errorRoute,loadingRoute)
}
export const RouteView=({children,path,intercept,guard})=>{
  const {isRoute, route: routeState}=useContext(routeContexts)
  const {routeData,prefetchManager}=useSupport()
  // console.log(isResume(), 'route-view',getCurrentContext());
  let data
  let inherit
  let parent
  try {
    const {route,routeAlready,currentRouteDif}=useContext(routeViewContext)
    inherit={
        route,
        routeAlready,
        name:currentRouteDif.name
    }
    parent=route
  } catch (e) {}
  let newPath=path()
  newPath=newPath?.startsWith('/')?newPath.slice(1):newPath
  // newPath=newPath === ''?'/':newPath
  let dRoutes=newPath === '/' || newPath === ''?parent:parent?.endsWith('/')?parent+newPath:parent+'/'+newPath
  if (parent && path() === '/') {
    dRoutes='/'
  }
  if (!parent && !dRoutes ) {
    dRoutes='/'
  }
  if (intercept?.()) {
    dRoutes=path()
  }
  // const routes=routeArray.filter((value)=>value.route === dRoutes) 
  const routes = [...routeArray.filter((value)=>value.route === dRoutes)]
//   console.log(routes);
routes.reverse()
   
  let myRouteDifinition
  if (inherit && !intercept?.()) {
      
      const already=inherit.routeAlready
      const n= routes.find(r =>!already.has(r.name))
    myRouteDifinition=n
  }else{
    myRouteDifinition=routes[0]
  }
  runEffect(()=>{
    return ()=>{
      if (inherit) {
        inherit.routeAlready.delete(myRouteDifinition.name)
      }
    }
  })
  loadingRoute.value[dRoutes]=false
  const isDynamic=path().includes(':') || myRouteDifinition.acceptQuery && myRouteDifinition.render === 'ssr'
  const isRouteLoading=()=>loadingRoute.value[dRoutes]
  const isRouteError=()=>errorRoute.value[dRoutes]
  const isRouteErrorFalse=()=>errorRoute.value[dRoutes]=false
  const isRouteToFalse=()=>loadingRoute.value[dRoutes]=false
  if (routeData[dRoutes]) {
    data=routeData[dRoutes]
    if (data.error) {
      errorRoute.value[dRoutes]=true
      errorRoute.value.message=data.error
    }
  }
  
  const underRoute=true
  pageContext.setValue({data,route:dRoutes,currentRouteDif:myRouteDifinition,prefetchManager})
  const isIntercepted=intercept?.()
  if (isIntercepted && !isServer()) {
    dRoutes=path()
    const {route,currentRouteDif}=useContext(routeViewContext)
    runEffect(()=>{
      intersetMap.set(path(),currentRouteDif)
      return()=> {
        intersetMap.delete(path())
      }
    })
  }
  const routeAlready=inherit?inherit.routeAlready:new Set()
  // console.log(myRouteDifinition);
  
  routeAlready.add(myRouteDifinition.name)
  routeViewContext.setValue({route:dRoutes,currentRouteDif:myRouteDifinition,routeAlready})
  const name=routeMap.get(myRouteDifinition?.name) || {name:''}
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
  const routeControl=routeMap.get(myRouteDifinition.name) || {name:''}
  if (loadingLoader && !isServer() && routeControl?.loadingLoad) {
    const loader=routeControl?.loadingLoad
   loader()
  }
  if (error && !isServer() && routeControl?.error) {
   const loader=routeControl?.error
   loader()
  }
const routeKey = () => {
    const currentUrl = isRoute.value.keyUrl || isRoute.value.fullUrl || '';
    const url = new URL(currentUrl, isServer() ? 'http://localhost' : window.location.origin);
    const isTerminal = isRoute.value.route === dRoutes;
    const search = (isTerminal && url.search) ? url.search : '';
    
    if (!isDynamic) return dRoutes + search;
    
    const paramKeys = path().match(/:[a-zA-Z0-9_$]+/g) || [];
    const paramValues = paramKeys.map(pk => isRoute.value.param[pk.slice(1)] || '').join('-');
    return `${dRoutes}-${paramValues}${search}`;
  }
  
   useInsert({condition,loader,underRoute,loadingLoader,error,isRouteErrorFalse,isRouteLoading,isRouteToFalse,isRouteError, routeKey,name})
  return html `
    <template >
      ${loadingLoader ? html `
        <route-loading if="isRouteLoading()" :route="'${myRouteDifinition.name}'"></route-loading>
        `:''}
      ${error ? html `
        <route-error if="isRouteError()" :route="'${myRouteDifinition.name}'"></route-error>
        `:''}
      
      <import-component if="condition()" :imports="loader" :loading="isRouteToFalse" ${name?.childViews?':child="name.childViews"' : ''} :routes="'${dRoutes}'">
        ${children}
      </import-component>
   
    </template>
  `
}
