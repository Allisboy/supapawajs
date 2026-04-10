import { IncomingMessage, ServerResponse } from 'node:http';
import { AxiosInstance } from 'axios';
import { State } from 'pawajs';
import { Plugin } from 'vite';

/**
 * Context provided to server-side functions (init, actions, middleware)
 */
export interface PawaContext {
    url: string;
    param: Record<string, string>;
    query: Record<string, string>;
    reqData: Record<string, any>;
    title: string;
    description: string;
    meta: Record<string, string>;
    csrfToken: string;
    request: IncomingMessage;
    response: ServerResponse;
    user?: any;
    /** Helper to redirect the user */
    redirect: (url: string, msg?: string, status?: number, type?: string) => void;
    /** Helper to set a flash message */
    flash: (msg: string, type?: string) => void;
    /** Trigger ISR revalidation for a path */
    revalidate: (path?: string) => Promise<void>;
}

/** Internal helper to extract reqData type from an action function */
type InferActionArg<F> = F extends (ctx: { reqData: infer P } & any) => any ? P : any;

/** Internal helper to map server actions to client calls */
type ClientActions<T> = {
    [K in keyof T]: (payload: InferActionArg<T[K]>) => ReturnType<T[K] extends (...args: any) => any ? T[K] : any>
};

/**
 * Configuration object for createServerSide
 */
export interface CreateServerSideConfig<A = Record<string, (context: PawaContext) => Promise<any>>> {
    name?: string;
    title?: string;
    description?: string;
    meta?: Record<string, string>;
    middleware?: Array<(context: PawaContext) => boolean | void | Promise<boolean | void>>;
    actions?: A;
    init?: (context: PawaContext) => Promise<any>;
    rateLimit?: { limit: number; windowMs: number } | false;
    generateParams?: (context: PawaContext) => Promise<Array<Record<string, string>>>;
    type?: 'ssr' | 'isr' | 'static';
    ssr?: boolean;
    isr?: boolean;
    static?: boolean;
    revalidate?: number;
}

/**
 * The object returned by useActions()
 */
export interface ActionInstance<T extends Record<string, (ctx: any) => Promise<any>>> {
    /** Callable server actions with full type safety and reactive state */
    action: ClientActions<T>;
    http: AxiosInstance;
    routeData: any;
    request: PawaContext;
    /** Reactive loading states for each action */
    loading: State<Partial<Record<keyof T, boolean>>>;
    /** Reactive error states for each action */
    error: State<Partial<Record<keyof T, any>>>;
}

/** Core Exports */
export function createServerSide<A extends Record<string, (context: PawaContext) => Promise<any>>>(
    config: CreateServerSideConfig<A>
): {
    server: CreateServerSideConfig<A> & { route: string };
        client: { 
            init: boolean; 
            route: string; 
            name: string; 
            middleware: boolean;
            actions: Array<keyof A>; // Add actions here
        };
};

export function handleServerAction(req: any, res: any): Promise<void>;
export function handleRoutePrefetch(req: any, res: any): Promise<void>;
export function generateStaticSites(options: { distDir: string }): Promise<void>;
export function addGlobalMiddleware(...middleware: Array<(ctx: PawaContext) => any>): void;

/** Hook Exports (from express-init) */
/** Overload for string URL */
export function useActions<T = Record<string, any>>(url: string): ActionInstance<T>;

/** Overload for Config object */
export function useActions<T extends Record<string, any>>(
    config: { 
        server: { actions: T }; 
        client: { actions: Array<keyof T> }; 
    }
): ActionInstance<T>;

export function useFlash(): {
    message: State<{ message: string; type: string } | null>;
    show: (msg: string, type?: string) => void;
    clear: () => void;
};

export function useQuery(): State<Record<string, string>>;
export function useParams(): State<Record<string, string>>;
export function useSupport(): any;

/** Router Component Exports */
export function Router(props: { children: any }): any;
export function RouteView(props: { path: string | (() => string), children: any, intercept?: () => boolean, guard?: () => boolean }): any;
export function NotFound(props: { path?: string | (() => string), children?: any }): any;
export function RouteProgressBar(props: { children: any }): any;

/** Router Logic Exports */
export function useRouter(): {
    navigateTo: (url: string) => void;
    current: () => string;
    param: () => Record<string, string>;
};
export function usePage<T = any>(): {
    data: T;
    error: any;
};

/** Vite Plugins */
export function PawaRoutes(): Plugin;
export function PawaScaffold(): Plugin;

/** Global State */
export const user: State<any>;
export const loadingCount: State<number>;

declare module 'supapawajs' {
    export * from 'supapawajs/index';
}

declare module 'supapawajs/express-init' {
    // ActionInstance is declared globally, no import needed here.

    /** Overload for string URL */
    export function useActions<T = Record<string, any>>(url: string): ActionInstance<T>;

    /** Overload for Config object */
    export function useActions<T extends Record<string, any>>(
        config: { 
            server: { actions: T }; 
            client: { actions: Array<keyof T> }; 
        }
    ): ActionInstance<T>;
}