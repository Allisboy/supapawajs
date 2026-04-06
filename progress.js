import { $state, html, useInsert } from "pawajs"


export const progress = $state({
        value: 0,
        visible: false,
        route: '',
        status: 'idle'
    })
  // Complete progress bar
   export const completeProgress = (routePath) => {
        progress.value = {
            value: 100,
            visible: true,
            route: routePath || latest,
            status: 'complete'
        }
        // Hide after animation
        setTimeout(() => {
            progress.value = { ...progress.value, visible: false, value: 0 }
        }, 300)
    }

    // Error progress bar
  export  const errorProgress = (routePath) => {
        progress.value = {
            value: 0,
            visible: true,
            route: routePath || latest,
            status: 'error'
        }
        setTimeout(() => {
            progress.value = { ...progress.value, visible: false, value: 0 }
        }, 2000)
    }
  export  const updateProgress = (value, status, routePath) => {
        progress.value = {
            value,
            visible: value > 0 && value < 100,
            route: routePath || latest,
            status
        }
    }
// Simulate progress animation
  export const simulateProgress = (routePath, onComplete) => {
        let currentProgress = 0
        const maxProgress = 95 // Leave 5% for actual completion
        
        const interval = setInterval(() => {
            if (currentProgress < maxProgress) {
                // Increment by random amount, slowing as it gets higher
                const increment = Math.random() * (15 - currentProgress / 10)
                currentProgress = Math.min(currentProgress + increment, maxProgress)
                updateProgress(Math.floor(currentProgress), 'loading', routePath)
            } else {
                clearInterval(interval)
            }
        }, 100)
        
        return () => {
            clearInterval(interval)
            if (onComplete) onComplete()
        }
    }


    // Progress bar style helper
    const progressBarStyle = () => {
        const width = progress.value.value
        const isComplete = width === 100
        const isError = progress.value.status === 'error'
        
        let transition = 'width 0.3s cubic-bezier(0.4, 0, 0.2, 1)'
        if (isComplete) {
            transition = 'width 0.2s ease-out'
        }
        
        return `width: ${width}%; transition: ${transition}`
    }
    
    const progressBarClass = () => {
        const base = 'h-1 transition-all duration-300'
        if (progress.value.status === 'error') {
            return `${base} bg-red-500`
        }
        if (progress.value.status === 'complete') {
            return `${base} bg-green-500`
        }
        return `${base} bg-blue-600`
    }

export const RouteProgressBar = ({children}) => {
    useInsert({ progress, progressBarStyle, progressBarClass });
    return html `
    <div>
        <div if="progress.value.visible" class="fixed top-0 left-0 w-full z-50">
            <div class="@{progressBarClass()}" style="@{progressBarStyle()}"></div>
        </div>
        ${children}
    </div>
    `
}