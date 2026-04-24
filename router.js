import {useRouter,setRoutes,matchRoute,Router,RouterPlugin,useRouteState} from './client/router.js'
import {RouteView,usePage} from './client/routeView.js'
import {NotFound,RouteError,RouteLoading} from './client/route-control.js'
import {RouteProgressBar} from './progress.js'
import { RegisterComponent } from "pawajs";
import { ImportComponent } from "./import-component.js";
export {
  useRouter,Router,RouterPlugin,
  setRoutes,matchRoute,useRouteState,
  RouteView,usePage,NotFound,RouteProgressBar
}

RegisterComponent('Router',Router,'RouteView',RouteView,'NotFound',NotFound,'RouteError',RouteError,'RouteLoading',RouteLoading,'ImportComponent',ImportComponent)