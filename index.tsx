import React from 'react';
import ReactDOM from 'react-dom/client';
import './src/index.css';
import App from './src/App';
import { ClerkProvider } from '@clerk/clerk-react';
import { dark } from '@clerk/themes';

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
      <ClerkProvider
        publishableKey={PUBLISHABLE_KEY}
        afterSignOutUrl="/"
        appearance={{
          baseTheme: dark,
          variables: {
            colorBackground: '#000000',
            colorInputBackground: '#171717',
            colorInputText: '#ffffff',
            borderRadius: '0.5rem',
            colorPrimary: '#3b82f6',
            colorText: '#ffffff',
            colorTextSecondary: '#9ca3af',
          },
        }}
      >
        <App clerkEnabled />
      </ClerkProvider>
    ) : (
      <App clerkEnabled={false} />
    )}
  </React.StrictMode>
);