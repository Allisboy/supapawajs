import { components, html, isResume, render, runEffect, useAsync, useValidateComponent } from "pawajs"
import { isServer } from "pawajs/server"
/**
 * @param {{imports: ()=>Promise, children: string, error: ()=>string, loading: ()=>string}} props
 * @description Dynamically imports and renders a component. It handles loading, error, and success states,
 * and is compatible with server-side rendering and client-side resumption.
 */
export const ImportComponent = async ({ imports, children, error, loading }) => {
    const {onSuspense}=useAsync()
    const func=imports()
    const loader=loading?.() || ''
    if (loader) {
        loader()
    }
    
    try {
        await func()
        return children
    } catch (err) {
        console.error(`[PawaJS] Component render error:`, err);
        // Execute error fallback if it's a function, otherwise use the string/html provided
        const errorContent = typeof error === 'function' ? error() : error;
        return errorContent || html`<div class="p-4 bg-red-50 border border-red-200 text-red-600 rounded">Error: Failed to load component.</div>`;
    }
}
useValidateComponent(ImportComponent, {
    imports: { type: Function, default: Promise.resolve() },
    error: { type: String, default:  ()=>false  },
    loading: { type: Function, default:  ()=>false }
})