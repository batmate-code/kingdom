import { Component, StrictMode, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { useGame } from './store';

/** Ошибка интерфейса — текст на экране вместо белой страницы. */
class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  override state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  override render() {
    if (!this.state.error) return this.props.children;
    return (
      <div
        style={{
          padding: 24,
          fontFamily: 'system-ui',
          color: '#ece6f2',
          background: '#15121a',
          minHeight: '100vh',
        }}
      >
        <h2>Ошибка интерфейса</h2>
        <pre style={{ whiteSpace: 'pre-wrap' }}>{this.state.error.message}</pre>
        <button
          onClick={() => {
            useGame.getState().reset();
            this.setState({ error: null });
          }}
        >
          Новая партия
        </button>
      </div>
    );
  }
}

const root = document.getElementById('root');
if (!root) throw new Error('Не найден элемент #root');

createRoot(root).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);
