import { State } from 'pawajs';

/** Internal helper to extract reqData type from an action function */
type InferActionArg<F> = F extends (ctx: infer C, ...args: any[]) => any 
    ? (C extends { reqData: infer P } ? P : any) 
    : any;

/** Internal helper to map server actions to client calls */
type ClientActions<T> = {
    [K in keyof T]: (payload?: InferActionArg<T[K]>) => Promise<T[K] extends (...args: any) => Promise<infer R> ? R : any>
};

export interface HttpClient {
    get<T = any>(url: string, config?: any): Promise<{ data: T, status: number }>;
    post<T = any>(url: string, data?: any, config?: any): Promise<{ data: T, status: number }>;
}

export interface ActionInstance<T extends Record<string, (ctx: any) => Promise<any>>> {
    /** Callable server actions with full type safety and reactive state */
    action: ClientActions<T>;
    http: HttpClient;
    routeData: any;
    request: any;
    /** Reactive loading states for each action */
    loading: State<Partial<Record<keyof T, boolean>>>;
    /** Reactive error states for each action */
    error: State<Partial<Record<keyof T, any>>>;
}

    export function ExpressInit(props: { children: any }): any;

        /** Overload for Config object */
        export function useActions<T extends Record<string, (ctx: any) => Promise<any>>>(
            config: { 
                server: { actions?: T; [key: string]: any }; 
                client: { route: string; actions: Array<keyof T> | string[] }; 
            }
        ): ActionInstance<T>;

    /** Overload for string URL */
    export function useActions<T = Record<string, (ctx: any) => Promise<any>>>(url: string): ActionInstance<T>;

    export function useFlash(): {
        message: State<{ message: string; type: string } | null>;
        show: (msg: string, type?: string) => void;
        clear: () => void;
    };

    export function useQuery(): State<Record<string, string>>;
    export function useParams(): State<Record<string, string>>;

    export interface SupportContext {
        clientRouting: Record<string, any>;
        prefetchManager: any;
        routeData: Record<string, any>;
        http: HttpClient;
        flashMessage: State<{ message: string; type: string } | null>;
        user: State<any>;
        query: State<Record<string, string>>;
        params: State<Record<string, string>>;
    }
    export function useSupport(): SupportContext;