import { PluginObject, State } from 'pawajs';
/** 
 * ROUTER ENTRY POINT (supapawajs/router)
 * Pure UI components and browser-friendly routing logic.
 */
export function Router(props: { children: any }): any;
    export function RouteView(props: { path: string | (() => string), children: any, intercept?: () => boolean, guard?: () => boolean }): any;
    export function NotFound(props: { path?:() => string, children?: any }): any;
    export function RouteProgressBar(props: { children: any }): any;
    export function RouteEntry(): any;

    export function RouterPlugin(): PluginObject;

    /**
     * Configures the router with the provided route definitions.
     */
    export function RouterConfig(routes: any[]): void;

    /**
     * Matches a URL path against a pattern. 
     * Supports parameters (:id) and catch-all segments ([:...slug] or [*slug]).
     */
    export function matchRoute(pattern: string, path: string): [boolean, Record<string, string>];

    export function useRouter(): {
        navigateTo: (url: string, options?: {
            replace?: boolean;
            state?: any;
            scroll?: boolean;
            shallow?: boolean;
            query?: Record<string, any> | null;
            hash?: string;
        }) => void;
        current: () => string;
        param: State<Record<string, string>>;
    };

    export function usePage<T = any>(): {
        page:State<T>;
    };

    export function useRouteData<T = any>(): State<T>;
    export function useRouteState(): {
        route: State<string>;
        isRoute: State<any>;
        loading: State<boolean>;
    };