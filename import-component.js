import { usePage } from "@/Router"
import { components, html, isResume, RegisterComponent, render, runEffect, useAsync, useValidateComponent } from "pawajs"
import { isServer } from "pawajs/server"
/**
 * @param {{imports: ()=>Promise, children: string, error: ()=>string, loading: ()=>string}} props
 * @description Dynamically imports and renders a component. It handles loading, error, and success states,
 * and is compatible with server-side rendering and client-side resumption.
 */
export const ImportComponent = async ({ imports, children, error, loading , pageFor,child}) => {
    const {onSuspense}=useAsync()
    const func=imports()
    const loader=loading?.() || ''
    const resume=isResume()
    if (loader) {
        loader()
    }
    
    try {

        const page=await func().then(mod => mod)
        
        if(page?.default === undefined) return children || html`<div class="p-4 bg-yellow-50 border border-yellow-200 text-yellow-600 rounded">Warning: Component loaded but no default export found.</div>`
        const meta=page?.meta
        if (meta && typeof meta === 'function' && !isServer() && !resume) {
            const data=usePage()
            const getMeta=meta(data?.data || {})
            document.title=getMeta.title
        }else if(meta?.title && !isServer() && !resume){
            document.title=meta.title
        }
        if (pageFor() === 'route') {
            
            components.set('ROUTEPAGE', page.default)
            if (children.trim() !== '') {
               const res= children.replace(/<intercept-route><\/intercept-route>/g, `<route-page>${child()}</route-page>`)
                return res   
            }
            
            return html`<route-page>${child()}</route-page>`    
        }
            
            components.set('NOTFOUNDPAGES', page.default) 
            if (!isServer()) {
                document.title='404 - page not found'
            }  
            return html`<not-found-pages>${children}</not-found-pages>`
        
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
    loading: { type: Function, default:  ()=>false },
    pageFor: { type: String, default: 'route' },
    child: { type: String, default: '' }
})