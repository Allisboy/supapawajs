import { IncomingMessage, ServerResponse } from 'node:http';
import { State,PluginObject  } from 'pawajs';
import { Plugin } from 'vite';
import { HttpClient } from './express-init';

/**
 * Context provided to server-side functions (init, actions, middleware)
 */
interface PawaContext {
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
    session?: any;
    auth?: {
        isAuthenticated: boolean;
        user: any;
        login: (userData: any) => Promise<void>;
        logout: () => Promise<void>;
        update: (userData: any) => Promise<void>;
    };
    /** Helper to redirect the user */
    redirect: (url: string, msg?: string, status?: number, type?: string) => void;
    /** Helper to set a flash message */
    flash: (msg: string, type?: string) => void;
    /** Trigger ISR revalidation for a path */
    revalidate: (path?: string) => Promise<void>;
}

/** Internal helper to extract reqData type from an action function */
type InferActionArg<F> = F extends (ctx: infer C, ...args: any[]) => any 
    ? (C extends { reqData: infer P } ? P : any) 
    : any;

/** Internal helper to extract the return type of the init function from a createServerSide config */
export type InferInitData<T> = T extends { server: { init?: (...args: any[]) => Promise<infer R> } } 
    ? R 
    : any;

/** Internal helper to map server actions to client calls */
type ClientActions<T> = {
    [K in keyof T]: (payload?: InferActionArg<T[K]>) => Promise<T[K] extends (...args: any) => Promise<infer R> ? R : any>
};

/**
 * Configuration object for createServerSide
 */
interface CreateServerSideConfig<A = Record<string, (context: PawaContext) => Promise<any>>> {
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
interface ActionInstance<T extends Record<string, (ctx: any) => Promise<any>>> {
    /** Callable server actions with full type safety and reactive state */
    action: ClientActions<T>;
    http: HttpClient;
    routeData: any;
    request: PawaContext;
    /** Reactive loading states for each action */
    loading: State<Partial<Record<keyof T, boolean>>>;
    /** Reactive error states for each action */
    error: State<Partial<Record<keyof T, any>>>;
}

/** Vite Plugins */
export function PawaRoutes(): Plugin;
export function PawaScaffold(): Plugin;


/** Global State */
export const user: State<any>;
export const loadingCount: State<number>;
export const progress: State<{
    value: number;
    visible: boolean;
    route: string;
    status: 'idle' | 'loading' | 'starting' | 'complete' | 'error';
}>;

/** Auth Provider and Options */
export interface AuthProviderOptions {
    cookieName?: string;
    secure?: boolean;
    sameSite?: 'lax' | 'strict' | 'none';
    maxAge?: number;
    path?: string;
    cookieOptions?: any;
    ttl?: number;
}

export class AuthProvider {
    constructor(adapter: SessionAdapter, options?: AuthProviderOptions);
    getSession(req: IncomingMessage): Promise<any>;
    createSession(res: ServerResponse, data: any): Promise<{ sessionId: string, data: any }>;
    updateSession(req: IncomingMessage, res: ServerResponse, data: any): Promise<{ sessionId: string, data: any }>;
    destroySession(req: IncomingMessage, res: ServerResponse): Promise<void>;
    touchSession(req: IncomingMessage): Promise<void>;
}

/** Session Adapters */
export abstract class SessionAdapter {
    abstract get(sessionId: string): Promise<any>;
    abstract set(sessionId: string, data: any, ttl?: number): Promise<void>;
    abstract delete(sessionId: string): Promise<void>;
    abstract touch(sessionId: string, ttl?: number): Promise<void>;
}

export class SqlAdapter extends SessionAdapter {
    constructor(db: any, table?: string);
    get(sessionId: string): Promise<any>;
    set(sessionId: string, data: any, ttl?: number): Promise<void>;
    delete(sessionId: string): Promise<void>;
    touch(sessionId: string, ttl?: number): Promise<void>;
    createTable(): Promise<void>;
    cleanup(): Promise<void>;
}

export class RedisAdapter extends SessionAdapter {
    constructor(redisClient: any, prefix?: string);
    get(sessionId: string): Promise<any>;
    set(sessionId: string, data: any, ttl?: number): Promise<void>;
    delete(sessionId: string): Promise<void>;
    touch(sessionId: string, ttl?: number): Promise<void>;
}

    export function createServerSide<A extends Record<string, (context: PawaContext) => Promise<any>>>(
        config: CreateServerSideConfig<A>
    ): {
        server: CreateServerSideConfig<A> & { route: string };
        client: { 
            init: boolean; 
            route: string; 
            name: string; 
            middleware: boolean;
            actions: Array<keyof A>;
        };
    };

    export function handleServerAction(req: IncomingMessage, res: ServerResponse): Promise<void>;
    export function handleRoutePrefetch(req: IncomingMessage, res: ServerResponse): Promise<void>;
    export function generateStaticSites(options: { distDir: string }): Promise<void>;
    export function addGlobalMiddleware(...middleware: Array<(ctx: PawaContext) => any>): void;
    export function handleCsrfToken(req: IncomingMessage, res: ServerResponse): Promise<void>;

    /** Auth Middleware Helpers */
    export function authMiddleware(authProvider: AuthProvider): (ctx: PawaContext) => Promise<boolean>;
    export function requireAuth(redirectTo?: string): (ctx: PawaContext) => Promise<boolean>;
    export function verifiedEmail(redirectTo?: string): (ctx: PawaContext) => Promise<void | boolean>;
    export function requireRole(...roles: string[]): (ctx: PawaContext) => Promise<boolean>;
    export function redirectIfAuth(redirectTo?: string): (ctx: PawaContext) => Promise<boolean>;


    export { PawaContext, CreateServerSideConfig, ActionInstance };


declare module 'supapawajs/store'{
    export const user: State<any>;
}

declare module 'supapawajs/progress'{
    export * from 'supapawajs/progress'
}
