import * as React from 'react';
import { AlertCircle, RefreshCw } from 'lucide-react';

interface Props {
  children: React.ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends React.Component<any, any> {
  constructor(props: any) {
    super(props);
    (this as any).state = {
      hasError: false,
      error: null
    };
  }

  public static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('Uncaught error:', error, errorInfo);
  }

  public render() {
    if ((this as any).state.hasError) {
      let errorMessage = "Something went wrong.";
      let isFirestoreError = false;

      try {
        if ((this as any).state.error?.message) {
          const parsed = JSON.parse((this as any).state.error.message);
          if (parsed.error && parsed.operationType) {
            errorMessage = `Database Error: ${parsed.error} (Operation: ${parsed.operationType})`;
            isFirestoreError = true;
          }
        }
      } catch (e) {
        errorMessage = (this as any).state.error?.message || errorMessage;
      }

      return (
        <div className="min-h-screen bg-zinc-950 text-white flex items-center justify-center p-6">
          <div className="max-w-md w-full bg-white/5 border border-white/10 rounded-[2.5rem] p-10 text-center space-y-6">
            <div className="w-20 h-20 bg-rose-500/20 rounded-full flex items-center justify-center mx-auto">
              <AlertCircle className="w-10 h-10 text-rose-500" />
            </div>
            <div className="space-y-2">
              <h1 className="text-2xl font-bold">Application Error</h1>
              <p className="text-zinc-400 text-sm leading-relaxed">
                {errorMessage}
              </p>
              {isFirestoreError && (
                <p className="text-xs text-zinc-500 mt-4">
                  This usually happens due to Firestore Security Rules. Please ensure your rules allow this operation.
                </p>
              )}
            </div>
            <button
              onClick={() => window.location.reload()}
              className="w-full py-4 bg-white text-zinc-950 rounded-2xl font-bold flex items-center justify-center gap-2 hover:bg-zinc-200 transition-colors"
            >
              <RefreshCw className="w-5 h-5" />
              Reload Application
            </button>
          </div>
        </div>
      );
    }

    return (this as any).props.children;
  }
}
