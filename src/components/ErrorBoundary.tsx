import { Component, type ReactNode } from "react";
import { AlertTriangle, RotateCcw } from "lucide-react";

interface Props { children: ReactNode; }
interface State { hasError: boolean; error: Error | null; }

/** P2-02 FIX: ErrorBoundary global para evitar crashes sin feedback. */
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: unknown) {
    console.error("[ErrorBoundary]", error, info);
  }

  handleReset = () => this.setState({ hasError: false, error: null });

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-surface flex items-center justify-center p-6">
          <div className="bg-card border border-theme rounded-2xl p-8 max-w-md w-full text-center">
            <div className="w-14 h-14 mx-auto mb-4 rounded-2xl bg-danger/10 flex items-center justify-center">
              <AlertTriangle size={28} className="text-danger" />
            </div>
            <h1 className="text-xl font-bold text-primary mb-2">Algo salió mal</h1>
            <p className="text-sm text-secondary mb-4">
              Ocurrió un error inesperado en la interfaz. Puedes intentar recargar la vista.
            </p>
            {this.state.error && (
              <p className="text-xs text-danger bg-danger/5 border border-danger/20 rounded-lg p-2 mb-4 break-words">
                {this.state.error.message}
              </p>
            )}
            <button
              onClick={this.handleReset}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-accent text-white font-medium text-sm hover:bg-accent-hover transition-colors"
            >
              <RotateCcw size={16} /> Reintentar
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}