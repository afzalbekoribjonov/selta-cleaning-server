import { Component, type ErrorInfo, type ReactNode } from 'react'
import { AlertTriangle } from 'lucide-react'

interface Props {
  children: ReactNode
}

interface State {
  error: Error | null
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Admin panel xatolik:', error, info.componentStack)
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex min-h-screen items-center justify-center bg-bg px-4">
          <div className="w-full max-w-sm rounded-3xl border border-border bg-surface p-8 text-center shadow-sm">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-danger-bg text-danger">
              <AlertTriangle size={26} />
            </div>
            <h1 className="text-lg font-heading font-bold text-ink">Kutilmagan xatolik yuz berdi</h1>
            <p className="mt-2 text-sm text-gray-dark">Sahifani qayta yuklab ko'ring. Xatolik davom etsa, administratorga xabar bering.</p>
            <button
              onClick={() => window.location.reload()}
              className="mt-5 w-full rounded-xl bg-brand-primary py-2.5 text-sm font-bold text-white shadow-sm"
            >
              Qayta yuklash
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
