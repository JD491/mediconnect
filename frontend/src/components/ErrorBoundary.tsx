import { Component, type ErrorInfo, type ReactNode } from 'react';
import { FiAlertTriangle, FiRefreshCw } from 'react-icons/fi';

interface Props {
  children: ReactNode;
  /** Shown in the fallback UI, e.g. "Store Owner Dashboard" — helps identify which route broke. */
  boundaryName?: string;
}

interface State {
  error: Error | null;
}

/**
 * React Error Boundary. Placed around each role dashboard in App.tsx so a
 * render-time bug in one page (e.g. a null-ref while a Supabase query is
 * still loading) shows a recoverable, on-brand error screen instead of a
 * blank white page — and doesn't take down dashboards for *other* roles,
 * since each has its own boundary instance.
 *
 * Deliberately a class component: error boundaries are one of the few
 * remaining cases React doesn't support as a hook (no `useErrorBoundary`).
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // eslint-disable-next-line no-console
    console.error(`[ErrorBoundary${this.props.boundaryName ? `: ${this.props.boundaryName}` : ''}]`, error, info.componentStack);
  }

  private reset = () => this.setState({ error: null });

  render() {
    if (this.state.error) {
      return (
        <div className="min-h-screen flex items-center justify-center p-6">
          <div role="alert" className="glass-card max-w-sm text-center">
            <FiAlertTriangle className="mx-auto text-rose-500 mb-3" size={28} />
            <h2 className="font-extrabold text-[#0f2340] mb-1">Something went wrong</h2>
            <p className="text-sm text-[#5b7088] mb-4">
              {this.props.boundaryName ? `${this.props.boundaryName} hit an unexpected error.` : 'This page hit an unexpected error.'}{' '}
              Your data is safe — try reloading this section.
            </p>
            <button onClick={this.reset} className="btn-primary inline-flex items-center gap-2">
              <FiRefreshCw /> Try again
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
