import { components, html, useContext, useInsert, useValidateComponent } from "pawajs"
import { errorRoute, loadingRoute, routeContexts, routeMap } from "./router.js"
import { routeViewContext } from "./routeView.js"

export const RouteLoading=async({route,children})=>{
  const dRoutes=route()
  const routeIsLoading=()=>loadingRoute.value[dRoutes]
  const name=routeMap.get(dRoutes) || {name:''}
  const loader=name?.loadingLoad
  const compo=await loader()
  components.set('LOADINGROUTECOMPONENT',compo?.default)
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
  const routecontext=useContext(routeContexts)
  const router=routecontext.route
  const reFresh=()=>{ 
    //clear the route from prefetch manager if available
    routecontext.setLatest('')
    router.value=window.location.pathname
  }
  const error=errorRoute.value.message
  useInsert({reFresh,error})
  const compo=await loader()
  components.set('ERRORROUTECOMPONENT', compo?.default)
    return html `
    <div>
      <error-route-component :re-fresh="reFresh" :error="error"></error-route-component>
    </div>
    `
}
export const NotFound = ({ path, children }) => {
    const { isRoute } = useContext(routeContexts);
    
    let viewContext
    try {
      viewContext = useContext(routeViewContext);
    } catch (error) {
      
    }    
    // console.log(viewContext,path());
    const condition = () => {
        const targetPath = path();
        
        // 1. Explicit path match (e.g. <not-found path="/admin">)
        if (targetPath) {
          console.log(targetPath,'target');
          
            return isRoute.value.notfound === targetPath;
        }

        // 2. Local RouteView boundary match
        // If we are inside a RouteView, check if this is the active 404 boundary for this scope
      
         if (viewContext && viewContext?.currentRouteDif.name === isRoute.value.name && isRoute.value.notfound) {
             return true;
         }
         return isRoute.value.generalNotFound && isRoute.value.notfound === '';
        }
        
    const getLoader = () => {
        const route = isRoute.value.notfound;
        // Return the specific 404.js loader if it exists, otherwise a no-op promise
        return  routeMap.get(viewContext?.currentRouteDif?.name || 'index')?.notfoundLoad
    };

    useInsert({ 
        condition, 
        func: getLoader() 
    });

    return html `
            <import-component if="condition()" :imports="func" :page-for="'not-found'">
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
        
    `;
}

useValidateComponent(NotFound,{
  path:{
    default:false,
    type:String
  }
})

