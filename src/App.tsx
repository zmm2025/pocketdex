import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Routes, Route, useNavigate, useLocation } from 'react-router-dom';
import { CollectionState } from './types';
import { updateCardCount } from '../services/storage';
import { CARDS, SETS, getSetProgress } from '../services/db';
import { loadCollection as loadCollectionFromApi, saveCollection as saveCollectionToApi } from './services/collectionApi';

import { Button } from '../components/Button';
import { CardItem } from '../components/CardItem';
import {
  Library,
  BarChart3,
  ChevronLeft,
  Filter,
  Search,
  Cloud,
  CheckCircle2,
  AlertCircle,
  Loader2,
} from 'lucide-react';
import {
  SignInButton,
  UserButton,
  useSession,
  useUser,
} from '@clerk/clerk-react';

const SUPABASE_URL = (import.meta as any).env.VITE_SUPABASE_URL;
const COLLECTION_API_BASE = SUPABASE_URL ? `${SUPABASE_URL}/functions/v1` : null;

const CLERK_PUBLISHABLE_KEY = (import.meta as any).env.VITE_CLERK_PUBLISHABLE_KEY as string | undefined;
const isProductionKeyOnLocalhost =
  typeof window !== 'undefined' &&
  window.location?.hostname === 'localhost' &&
  typeof CLERK_PUBLISHABLE_KEY === 'string' &&
  CLERK_PUBLISHABLE_KEY.startsWith('pk_live');

function getSyncErrorMessage(e: unknown): string {
  if (e == null) return 'Something went wrong.';
  if (e instanceof Error) return e.message;
  if (typeof e === 'object' && e !== null && 'message' in e) return String((e as { message: unknown }).message);
  return 'Something went wrong. Try again.';
}

type AppProps = { clerkEnabled?: boolean };

const App: React.FC<AppProps> = ({ clerkEnabled = true }) => {
  const { session } = useSession();
  const { user: clerkUser, isLoaded: isUserLoaded } = useUser();
  const navigate = useNavigate();
  const location = useLocation();

  // Update document title per route
  useEffect(() => {
    const titles: Record<string, string> = {
      '/': 'PocketDex',
      '/collection': 'Collection - PocketDex',
      '/statistics': 'Statistics - PocketDex',
    };
    document.title = titles[location.pathname] ?? 'PocketDex';
  }, [location.pathname]);

  const [collection, setCollection] = useState<CollectionState>({});
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSetId, setSelectedSetId] = useState<string>('A1');
  const [filterOwned, setFilterOwned] = useState<'all' | 'owned' | 'missing'>('all');

  const [syncStatus, setSyncStatus] = useState<'idle' | 'syncing' | 'saved' | 'error'>('idle');
  const [syncErrorMessage, setSyncErrorMessage] = useState<string | null>(null);
  const [clerkLoadTimedOut, setClerkLoadTimedOut] = useState(false);
  const hasLoadedFromCloudRef = useRef(false);
  const saveTimeoutRef = useRef<NodeJS.Timeout>();
  // Track when collection was just loaded from cloud to skip redundant save
  const justLoadedFromCloudRef = useRef(false);

  // After 4s of Clerk loading, show Sign in button anyway so user isn't stuck
  useEffect(() => {
    if (isUserLoaded) return;
    const t = setTimeout(() => setClerkLoadTimedOut(true), 4000);
    return () => clearTimeout(t);
  }, [isUserLoaded]);
  useEffect(() => {
    if (isUserLoaded) setClerkLoadTimedOut(false);
  }, [isUserLoaded]);

  const setSyncError = (message: string) => {
    setSyncStatus('error');
    setSyncErrorMessage(message);
  };

  const clearSyncError = () => setSyncErrorMessage(null);

  const isSupabaseConfigured = Boolean(COLLECTION_API_BASE);

  // 1. When signed in: load collection from Edge Function (Clerk JWT verified there)
  useEffect(() => {
    if (!clerkUser?.id || !COLLECTION_API_BASE) return;
    if (hasLoadedFromCloudRef.current) return;
    hasLoadedFromCloudRef.current = true;

    let cancelled = false;
    (async () => {
      try {
        const token = await session?.getToken();
        if (!token || cancelled) return;
        setSyncStatus('syncing');
        const cloudData = await loadCollectionFromApi(token, COLLECTION_API_BASE);
        if (cancelled) return;
        // Mark that we just loaded from cloud so auto-save skips this update
        justLoadedFromCloudRef.current = true;
        setCollection(cloudData ?? {});
        setSyncStatus('saved');
        clearSyncError();
        setTimeout(() => setSyncStatus('idle'), 3000);
      } catch (e) {
        if (!cancelled) setSyncError(`Sync failed: ${getSyncErrorMessage(e)}`);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [clerkUser?.id, session, COLLECTION_API_BASE]);

  // 2. When user signs out: clear collection and redirect to home if on protected route
  useEffect(() => {
    // Skip auth checks if Clerk is not enabled
    if (!clerkEnabled) return;
    // Wait for Clerk to finish loading before checking auth
    if (!isUserLoaded) return;
    
    if (!clerkUser) {
      hasLoadedFromCloudRef.current = false;
      setCollection({});
      if (location.pathname === '/collection' || location.pathname === '/statistics') {
        navigate('/');
      }
    }
  }, [clerkEnabled, clerkUser, isUserLoaded, location.pathname, navigate]);

  // 3. Guard: redirect to home if not signed in and trying to access protected routes
  useEffect(() => {
    // Skip auth checks if Clerk is not enabled
    if (!clerkEnabled) return;
    // Wait for Clerk to finish loading before checking auth
    if (!isUserLoaded) return;
    
    if (!clerkUser && (location.pathname === '/collection' || location.pathname === '/statistics')) {
      navigate('/');
    }
  }, [clerkEnabled, clerkUser, isUserLoaded, location.pathname, navigate]);

  // 4. Auto-save: when signed in, debounce save via Edge Function
  useEffect(() => {
    if (Object.keys(collection).length === 0) return;
    if (!clerkUser || !COLLECTION_API_BASE) return;
    // Skip save if collection was just loaded from cloud (avoids redundant write)
    if (justLoadedFromCloudRef.current) {
      justLoadedFromCloudRef.current = false;
      return;
    }
    setSyncStatus('syncing');
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(async () => {
      try {
        const token = await session?.getToken();
        if (!token) return;
        await saveCollectionToApi(token, clerkUser.id, collection, COLLECTION_API_BASE);
        setSyncStatus('saved');
        clearSyncError();
        setTimeout(() => setSyncStatus('idle'), 3000);
      } catch (e) {
        console.error('Cloud save failed', e);
        setSyncError(`Cloud save failed: ${getSyncErrorMessage(e)}`);
      }
    }, 2000);
    return () => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    };
  }, [collection, clerkUser, session, COLLECTION_API_BASE]);

  const handleUpdateCount = useCallback((cardId: string, delta: number) => {
    setCollection(prev => updateCardCount(prev, cardId, delta));
  }, []);

  const renderDashboard = () => (
    <div className="flex flex-col h-full justify-center p-6 space-y-6 max-w-md mx-auto relative">
      {/* Compact header: PocketDex + sync & profile in top right */}
      <header className="flex items-center justify-between gap-3 mb-2">
        <h1 className="text-xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-purple-400">
          PocketDex
        </h1>
        <div className="flex items-center gap-2 min-w-0">
          {clerkEnabled ? (
            <>
              {!isUserLoaded && !clerkLoadTimedOut ? (
                <span className="text-xs text-gray-500 flex items-center gap-1.5 shrink-0">
                  <Loader2 size={14} className="animate-spin text-gray-500 shrink-0" />
                  <span className="hidden xs:inline">Loading...</span>
                </span>
              ) : clerkUser ? (
                <>
                  <span className="text-xs text-gray-500 flex items-center gap-1.5 shrink-0 min-w-0" title={syncStatus === 'error' ? syncErrorMessage ?? undefined : undefined}>
                    {syncStatus === 'syncing' && <><Loader2 size={12} className="animate-spin shrink-0"/> <span className="hidden sm:inline truncate">Syncing...</span></>}
                    {syncStatus === 'saved' && <><CheckCircle2 size={12} className="text-green-500 shrink-0"/> <span className="hidden sm:inline truncate">Saved</span></>}
                    {syncStatus === 'error' && <><AlertCircle size={12} className="text-red-500 shrink-0"/> <span className="text-red-400 truncate hidden sm:inline">{syncErrorMessage ?? 'Error'}</span></>}
                    {syncStatus === 'idle' && <><Cloud size={12} className="text-gray-500 shrink-0"/> <span className="hidden sm:inline truncate">Up to date</span></>}
                  </span>
                  <UserButton />
                </>
              ) : (
                <>
                  <span className="text-xs text-gray-500 flex items-center gap-1.5 shrink-0">
                    <Cloud size={14} className="text-gray-500 shrink-0" />
                    <span className="hidden xs:inline">Sign in to sync</span>
                  </span>
                  {clerkLoadTimedOut ? (
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={() => window.location.reload()}
                    >
                      Retry sign-in
                    </Button>
                  ) : (
                    <SignInButton mode="modal">
                      <Button variant="primary" size="sm">Sign in</Button>
                    </SignInButton>
                  )}
                </>
              )}
            </>
          ) : (
            <span className="text-xs text-gray-500">Sign-in not configured</span>
          )}
        </div>
      </header>

      <div className="text-center mb-4">
        <p className="text-gray-400">TCG Pocket Companion</p>
      </div>

      {!clerkUser && (
        <div className="text-sm text-center text-gray-500 space-y-1">
          <p>Sign in to view your collection, track cards, and see statistics.</p>
          {clerkLoadTimedOut && (
            <div className="text-xs text-amber-500/90 space-y-2">
              {isProductionKeyOnLocalhost ? (
                <p>
                  <strong>Production key on localhost.</strong> Clerk production keys (<code className="bg-gray-800 px-1 rounded">pk_live_...</code>) do not work on localhost. In Clerk Dashboard, switch to the <strong>Development</strong> instance, copy the publishable key (<code className="bg-gray-800 px-1 rounded">pk_test_...</code>), and set <code className="bg-gray-800 px-1 rounded">VITE_CLERK_PUBLISHABLE_KEY</code> in <code className="bg-gray-800 px-1 rounded">.env.local</code> to that value. Restart the dev server.
                </p>
              ) : (
                <p>
                  Sign-in is still loading. Click &quot;Retry sign-in&quot; to refresh. If it keeps failing, in Clerk Dashboard (Development) go to Configure → Paths and set <strong>Fallback development host</strong> to <code className="bg-gray-800 px-1 rounded">http://localhost:3000</code> (or your dev port).
                </p>
              )}
            </div>
          )}
        </div>
      )}

      <Button
        variant="primary"
        size="lg"
        fullWidth
        disabled={!clerkUser}
        onClick={() => clerkUser && navigate('/collection')}
        className={`h-24 flex flex-col items-center justify-center gap-1 group ${!clerkUser ? 'opacity-60 cursor-not-allowed' : ''}`}
      >
        <Library className="group-hover:scale-110 transition-transform" />
        <span className="text-lg">My Collection</span>
        {!clerkUser && <span className="text-xs text-gray-400 font-normal">Sign in to view</span>}
      </Button>

      <Button
        variant="secondary"
        size="lg"
        fullWidth
        disabled={!clerkUser}
        onClick={() => clerkUser && navigate('/statistics')}
        className={`h-24 flex flex-col items-center justify-center gap-1 group bg-gray-800 border-gray-700 ${!clerkUser ? 'opacity-60 cursor-not-allowed' : ''}`}
      >
        <BarChart3 className="group-hover:scale-110 transition-transform text-green-400" />
        <span className="text-lg">Statistics</span>
        {!clerkUser && <span className="text-xs text-gray-400 font-normal">Sign in to view</span>}
      </Button>

      {!isSupabaseConfigured && (
        <p className="text-xs text-center text-amber-500 mt-4">
          Cloud sync is unavailable: add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to your environment (e.g. .env.local or deployment secrets).
        </p>
      )}
    </div>
  );

  const renderCollection = () => {
    const filteredCards = CARDS.filter(card => {
      const matchesSet = selectedSetId === 'ALL' || card.set === selectedSetId;
      const matchesSearch =
        card.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        String(card.number).includes(searchQuery);
      const isOwned = (collection[card.id] || 0) > 0;
      if (filterOwned === 'owned' && !isOwned) return false;
      if (filterOwned === 'missing' && isOwned) return false;
      return matchesSet && matchesSearch;
    });

    return (
      <div className="flex flex-col h-full bg-black">
        <div className="sticky top-0 z-30 bg-black/80 backdrop-blur-lg border-b border-gray-800 p-4 space-y-3">
          <div className="flex items-center gap-3">
            <button onClick={() => navigate('/')} className="p-2 -ml-2 text-gray-400 hover:text-white">
              <ChevronLeft />
            </button>
            <h2 className="text-xl font-bold hidden xs:block">Collection</h2>
            <select
              value={selectedSetId}
              onChange={(e) => setSelectedSetId(e.target.value)}
              className="bg-gray-900 border border-gray-700 text-white text-sm rounded-lg p-2 flex-1 max-w-[200px] outline-none focus:border-blue-500 truncate"
            >
              {SETS.map(set => (
                <option key={set.id} value={set.id}>{set.name} ({set.id})</option>
              ))}
              <option value="ALL">All Sets</option>
            </select>
            <div className="ml-auto text-xs text-gray-500 font-mono whitespace-nowrap">
              {filteredCards.length} Cards
            </div>
          </div>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={16} />
              <input
                type="text"
                placeholder="Search..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-gray-900 border border-gray-700 rounded-lg pl-9 pr-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500 transition-colors"
              />
            </div>
            <button
              className={`p-2 rounded-lg border ${filterOwned === 'owned' ? 'bg-blue-600 border-blue-600 text-white' : 'bg-gray-800 border-gray-700 text-gray-400'}`}
              onClick={() => setFilterOwned(prev => prev === 'owned' ? 'all' : 'owned')}
              title="Show Owned Only"
            >
              <Filter size={18} />
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-4 pb-24 touch-pan-y">
          {filteredCards.length === 0 ? (
            <div className="py-20 text-center text-gray-500 flex flex-col items-center">
              <p>No cards found.</p>
            </div>
          ) : (
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-3 md:gap-4 select-none">
              {filteredCards.map(card => (
                <CardItem
                  key={card.id}
                  card={card}
                  count={collection[card.id] || 0}
                  onIncrement={() => handleUpdateCount(card.id, 1)}
                  onDecrement={() => handleUpdateCount(card.id, -1)}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    );
  };

  const renderStats = () => (
    <div className="flex flex-col h-full p-6 overflow-y-auto">
      <div className="flex items-center gap-3 mb-8">
        <button onClick={() => navigate('/')} className="p-2 -ml-2 text-gray-400 hover:text-white">
          <ChevronLeft />
        </button>
        <h2 className="text-2xl font-bold">Statistics</h2>
      </div>
      <div className="space-y-6 pb-12">
        {SETS.map(set => {
          const stats = getSetProgress(set.id, collection);
          return (
            <div key={set.id} className="bg-gray-900 border border-gray-800 rounded-xl p-5 shadow-lg">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-bold text-white">{set.name}</h3>
                <span className="text-sm text-gray-400">{stats.owned} / {stats.total}</span>
              </div>
              <div className="w-full bg-gray-800 rounded-full h-4 overflow-hidden">
                <div
                  className="bg-gradient-to-r from-blue-600 to-purple-500 h-full rounded-full transition-all duration-1000 ease-out"
                  style={{ width: `${stats.percentage}%` }}
                />
              </div>
              <div className="mt-2 text-right">
                <span className="text-sm font-medium text-blue-400">{stats.percentage}% Complete</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );

  // Show loading state while Clerk is initializing (only for protected routes)
  const isProtectedRoute = location.pathname === '/collection' || location.pathname === '/statistics';
  if (clerkEnabled && !isUserLoaded && isProtectedRoute) {
    return (
      <div className="min-h-screen bg-black text-white font-sans flex items-center justify-center">
        <Loader2 className="animate-spin text-gray-400" size={32} />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-white font-sans overflow-hidden">
      <Routes>
        <Route path="/" element={renderDashboard()} />
        <Route path="/collection" element={renderCollection()} />
        <Route path="/statistics" element={renderStats()} />
      </Routes>
    </div>
  );
};

export default App;
