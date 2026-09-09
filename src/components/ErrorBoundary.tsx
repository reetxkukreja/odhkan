import React from 'react';
import { AlertCircle, RefreshCw } from 'lucide-react';

interface Props {
  children: React.ReactNode;
  fallbackTitle?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends React.Component<Props, State> {
  public override state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public override componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('Uncaught React error:', error, errorInfo);
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null });
    window.location.reload();
  };

  public override render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center p-4 bg-[#FAF9F5] text-neutral-900">
          <div className="max-w-md w-full bg-white rounded-2xl border border-red-200 shadow-xl p-6 sm:p-8 text-center">
            <div className="w-12 h-12 rounded-full bg-red-100 text-red-600 flex items-center justify-center mx-auto mb-4">
              <AlertCircle className="w-6 h-6" />
            </div>
            <h2 className="text-xl font-bold text-neutral-950 mb-2">
              {this.props.fallbackTitle || 'Something went wrong'}
            </h2>
            <p className="text-xs text-neutral-600 mb-4">
              {this.state.error?.message || 'An unexpected error occurred while rendering the page.'}
            </p>
            <button
              onClick={this.handleReset}
              className="inline-flex items-center justify-center gap-2 bg-neutral-950 text-white px-5 py-2.5 rounded-lg text-sm font-semibold hover:bg-neutral-800 transition-colors cursor-pointer"
            >
              <RefreshCw className="w-4 h-4" />
              <span>Reload Application</span>
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
