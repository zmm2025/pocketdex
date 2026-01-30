import React from 'react';
import ReactDOM from 'react-dom/client';
import './src/index.css';
import App from './src/App';
import { ClerkProvider } from '@clerk/clerk-react';

const PUBLISHABLE_KEY =
  (import.meta as any).env.VITE_CLERK_PUBLISHABLE_KEY;

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Could not find root element to mount to');
}

const root = ReactDOM.createRoot(rootElement);

root.render(
  <React.StrictMode>
    {PUBLISHABLE_KEY ? (
      <ClerkProvider publishableKey={PUBLISHABLE_KEY} afterSignOutUrl="/">
        <App clerkEnabled />
      </ClerkProvider>
    ) : (
      <App clerkEnabled={false} />
    )}
  </React.StrictMode>
);