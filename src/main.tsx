import React, { Suspense } from 'react'
import ReactDOM from 'react-dom/client'
// import App from './App.tsx'
import './index.scss'

const App = React.lazy(() => import('./App'))

// Simple Error Boundary
class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean, error: any }> {
    constructor(props: any) {
        super(props)
        this.state = { hasError: false, error: null }
    }
    static getDerivedStateFromError(error: any) {
        return { hasError: true, error }
    }
    componentDidCatch(error: any, info: any) {
        console.error("ErrorBoundary caught:", error, info)
    }
    render() {
        if (this.state.hasError) {
            return (
                <div style={{ padding: 20, color: 'red', backgroundColor: '#222' }}>
                    <h1>Application Crash</h1>
                    <pre>{this.state.error?.toString()}</pre>
                </div>
            )
        }
        return (
            <Suspense fallback={<h1 style={{ color: 'white' }}>Loading App...</h1>}>
                {this.props.children}
            </Suspense>
        )
    }
}

const root = document.getElementById('root')
if (root) {
    ReactDOM.createRoot(root).render(
        <React.StrictMode>
            <ErrorBoundary>
                <App />
            </ErrorBoundary>
        </React.StrictMode>,
    )
}
