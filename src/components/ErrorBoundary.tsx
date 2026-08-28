import React from 'react';

interface State {
  error: Error | null;
}

/**
 * Last line of defence. A malformed file or an unexpected shape should never
 * leave the user staring at a blank page with no explanation.
 */
export class ErrorBoundary extends React.Component<{ children: React.ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // Kept in the console so the stack is available while developing.
    console.error('MATLens crashed while rendering:', error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <div style={{ maxWidth: 640, margin: '80px auto', padding: 24 }}>
        <div className="card" style={{ padding: 26 }}>
          <span className="badge badge--critical">Unexpected error</span>
          <h1 className="t-h1" style={{ marginTop: 12 }}>MATLens could not render this view</h1>
          <p className="t-sub" style={{ marginTop: 8 }}>
            Something in the current dataset produced a shape the interface did not expect. Your file was never
            uploaded anywhere — reloading clears the session entirely.
          </p>
          <pre className="formula" style={{ marginTop: 14 }}>{this.state.error.message}</pre>
          <div className="row" style={{ marginTop: 16 }}>
            <button className="btn btn--primary" onClick={() => window.location.reload()}>
              Reload MATLens
            </button>
            <button className="btn" onClick={() => this.setState({ error: null })}>
              Try to continue
            </button>
          </div>
        </div>
      </div>
    );
  }
}
