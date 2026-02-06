import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Routes, Route, useNavigate, useLocation } from 'react-router-dom';
import { useVirtualizer } from '@tanstack/react-virtual';
import { CollectionState } from './types';
import { updateCardCount, getGuestCollection, setGuestCollection, clearGuestCollection } from '../services/storage';
import { CARDS, SETS, getSetProgress, getCollectionProgress, getSetBySlug, getSetSlug, LONGEST_SET_NAME, LONGEST_SET_ID } from '../services/db';
import { loadCollection as loadCollectionFromApi, saveCollection as saveCollectionToApi } from './services/collectionApi';
import { getNextHint, LOADING_HINT_RECENT_COUNT } from './loadingHints';

import { Button } from '../components/Button';
import { CardItem, type CardRect } from '../components/CardItem';
import { Modal } from '../components/Modal';
import {
  Library,
  BarChart3,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Filter,
  Search,
  Cloud,
  CheckCircle2,
  AlertCircle,
  Loader2,
  X,
} from 'lucide-react';
import {
  SignInButton,
  UserButton,
  useClerk,
  useSession,
  useUser,
} from '@clerk/clerk-react';

const SUPABASE_URL = (import.meta as any).env.VITE_SUPABASE_URL;
const COLLECTION_API_BASE = SUPABASE_URL ? `${SUPABASE_URL}/functions/v1` : null;

const CLERK_PUBLISHABLE_KEY = (import.meta as any).env.VITE_CLERK_PUBLISHABLE_KEY as string | undefined;
const DEMO_BANNER_DONT_SHOW_KEY = 'pocketdex_demo_banner_dont_show';
const DISMISSED_TOAST_DURATION_SEC = 5;
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

type GuestMergePromptState = 'idle' | 'loading' | 'open';

const App: React.FC<AppProps> = ({ clerkEnabled = true }) => {
  const { session } = useSession();
  const { user: clerkUser, isLoaded: isUserLoaded } = useUser();
  const { signOut } = useClerk();
  const navigate = useNavigate();
  const location = useLocation();

  const [guestMergePrompt, setGuestMergePrompt] = useState<GuestMergePromptState>('idle');
  const [cloudDataForMerge, setCloudDataForMerge] = useState<CollectionState | null>(null);
  const [demoBannerDismissed, setDemoBannerDismissed] = useState(false);
  const [demoBannerDontShow, setDemoBannerDontShow] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.localStorage.getItem(DEMO_BANNER_DONT_SHOW_KEY) === '1';
  });
  const [showDismissedToast, setShowDismissedToast] = useState(false);

  // Update document title per route
  useEffect(() => {
    if (location.pathname === '/') {
      document.title = 'PocketDex';
      return;
    }
    if (location.pathname === '/statistics') {
      document.title = 'Statistics - PocketDex';
      return;
    }
    if (location.pathname === '/collection') {
      document.title = 'Collection - PocketDex';
      return;
    }
    if (location.pathname.startsWith('/collection/')) {
      const slug = location.pathname.replace(/^\/collection\/?/, '');
      const set = slug ? getSetBySlug(slug) : null;
      document.title = set ? `${set.name} - PocketDex` : 'Collection - PocketDex';
      return;
    }
    document.title = 'PocketDex';
  }, [location.pathname]);

  const [collection, setCollection] = useState<CollectionState>({});
  const [searchQuery, setSearchQuery] = useState('');
  // Derive slug from pathname (useParams is not available in App, which is parent of Routes)
  const collectionSlugFromPath = location.pathname.startsWith('/collection')
    ? location.pathname.replace(/^\/collection\/?/, '')
    : '';
  const selectedSetId =
    location.pathname.startsWith('/collection')
      ? !collectionSlugFromPath
        ? 'ALL'
        : (getSetBySlug(collectionSlugFromPath)?.id ?? 'ALL')
      : 'ALL';

  const [lastCollectionSetSlug, setLastCollectionSetSlug] = useState<string | null>(null);
  const [statsFlashTargetId, setStatsFlashTargetId] = useState<string | null>(null);
  const [loadingHint, setLoadingHint] = useState(() => getNextHint([]));
  const loadingHintRecentRef = useRef<string[]>([]);
  useEffect(() => {
    if (location.pathname.startsWith('/collection')) {
      setLastCollectionSetSlug(collectionSlugFromPath || null);
    }
  }, [location.pathname, collectionSlugFromPath]);

  const [collectionSetDropdownOpen, setCollectionSetDropdownOpen] = useState(false);
  const [collectionSetDropdownFocusedIndex, setCollectionSetDropdownFocusedIndex] = useState(0);
  const collectionSetDropdownRef = useRef<HTMLDivElement>(null);
  const collectionSetListboxRef = useRef<HTMLDivElement>(null);
  const collectionSearchInputRef = useRef<HTMLInputElement>(null);
  const collectionScrollRef = useRef<HTMLDivElement>(null);
  const collectionSetMeasureRef = useRef<HTMLSpanElement>(null);
  const collectionSetIdMeasureRef = useRef<HTMLSpanElement>(null);
  const collectionDropdownWidthMeasuredRef = useRef(false);
  const measurerMountedOnceRef = useRef(false);
  const [collectionSetDropdownWidth, setCollectionSetDropdownWidth] = useState<number | null>(null);
  const [measurerMounted, setMeasurerMounted] = useState(0);
  useEffect(() => {
    if (collectionDropdownWidthMeasuredRef.current) return;
    if (!LONGEST_SET_NAME || !collectionSetMeasureRef.current) return;
    if (!LONGEST_SET_ID || !collectionSetIdMeasureRef.current) return;
    const nameWidth = collectionSetMeasureRef.current.getBoundingClientRect().width;
    const idWidth = collectionSetIdMeasureRef.current.getBoundingClientRect().width;
    const gapChevronPadding = 8 + 24 + 24;
    const w = Math.ceil(nameWidth) + Math.ceil(idWidth) + gapChevronPadding;
    collectionDropdownWidthMeasuredRef.current = true;
    setCollectionSetDropdownWidth(w);
  }, [measurerMounted]);

  useEffect(() => {
    if (!location.pathname.startsWith('/collection')) return;
    collectionScrollRef.current?.scrollTo(0, 0);
  }, [selectedSetId]);

  // Scroll Statistics to the set card when navigating with hash; position so bottom of set above is at top (with padding). Flash target card after scroll completes.
  useEffect(() => {
    if (location.pathname !== '/statistics' || !location.hash) return;
    const id = location.hash.slice(1);
    const target = id ? document.getElementById(id) : null;
    if (!target) return;

    const scrollPadding = 24;

    const runScroll = (scrollContainer: Element) => {
      const prev = target.previousElementSibling;
      const containerRect = scrollContainer.getBoundingClientRect();
      // Treat top of view as below the sticky header so the target isn't hidden (Statistics panel has sticky header as first child)
      const headerEl = scrollContainer.firstElementChild;
      const headerHeight = headerEl ? headerEl.getBoundingClientRect().height : 0;
      const effectiveTop = containerRect.top + headerHeight + scrollPadding;
      let delta: number;
      if (prev) {
        const prevRect = prev.getBoundingClientRect();
        delta = prevRect.bottom - effectiveTop;
      } else {
        const targetRect = target.getBoundingClientRect();
        delta = targetRect.top - effectiveTop;
      }
      const scrollTopBefore = scrollContainer.scrollTop;
      const maxScroll = scrollContainer.scrollHeight - scrollContainer.clientHeight;
      const newScrollTop = Math.max(0, Math.min(maxScroll, scrollTopBefore + delta));
      scrollContainer.scrollTo({ top: newScrollTop, behavior: 'smooth' });
    };

    let scrollContainer: Element | null = target.parentElement;
    while (scrollContainer && scrollContainer !== document.body) {
      const overflowY = getComputedStyle(scrollContainer).overflowY;
      if (overflowY === 'auto' || overflowY === 'scroll' || overflowY === 'overlay') break;
      scrollContainer = scrollContainer.parentElement;
    }
    if (!scrollContainer) return;

    const startFlashMs = 550;
    const flashDurationMs = 550;
    const startFlash = setTimeout(() => setStatsFlashTargetId(id), startFlashMs);
    const clearFlash = setTimeout(() => setStatsFlashTargetId(null), startFlashMs + flashDurationMs);

    const doScrollWhenReady = () => {
      const maxScroll = scrollContainer!.scrollHeight - scrollContainer!.clientHeight;
      if (maxScroll > 0) {
        runScroll(scrollContainer!);
        return true;
      }
      return false;
    };

    if (doScrollWhenReady()) {
      return () => {
        clearTimeout(startFlash);
        clearTimeout(clearFlash);
      };
    }

    let rafId: number;
    const maxAttempts = 60;
    let attempts = 0;
    const tryScroll = () => {
      attempts += 1;
      if (doScrollWhenReady()) return;
      if (attempts < maxAttempts) {
        rafId = requestAnimationFrame(tryScroll);
      } else {
        // Container never became scrollable (e.g. parent has no fixed height). Fall back to window scroll: position so bottom of set above is at top with padding.
        const prev = target.previousElementSibling;
        if (prev) {
          const prevRect = prev.getBoundingClientRect();
          window.scrollTo({ top: window.scrollY + prevRect.bottom - scrollPadding, behavior: 'smooth' });
        } else {
          target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      }
    };
    rafId = requestAnimationFrame(tryScroll);
    return () => {
      cancelAnimationFrame(rafId);
      clearTimeout(startFlash);
      clearTimeout(clearFlash);
    };
  }, [location.pathname, location.hash]);

  const [filterOwned, setFilterOwned] = useState<'all' | 'owned' | 'missing'>('all');

  // Column count for collection grid (matches Tailwind: 3 < sm, 4 sm–md, 6 md+)
  const [collectionColumnCount, setCollectionColumnCount] = useState(() =>
    typeof window !== 'undefined' ? (window.innerWidth < 640 ? 3 : window.innerWidth < 768 ? 4 : 6) : 3
  );
  useEffect(() => {
    const onResize = () =>
      setCollectionColumnCount(window.innerWidth < 640 ? 3 : window.innerWidth < 768 ? 4 : 6);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const isCollectionRoute = location.pathname.startsWith('/collection');
  const collectionFilteredCards = useMemo(() => {
    if (!isCollectionRoute) return [];
    return CARDS.filter((card) => {
      const matchesSet = selectedSetId === 'ALL' || card.set === selectedSetId;
      const matchesSearch =
        card.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        String(card.number).includes(searchQuery);
      const isOwned = (collection[card.id] || 0) > 0;
      if (filterOwned === 'owned' && !isOwned) return false;
      if (filterOwned === 'missing' && isOwned) return false;
      return matchesSet && matchesSearch;
    });
  }, [isCollectionRoute, selectedSetId, searchQuery, filterOwned, collection]);

  const collectionRowCount =
    isCollectionRoute && collectionFilteredCards.length > 0
      ? Math.ceil(collectionFilteredCards.length / collectionColumnCount)
      : 0;
  // Use a small fixed estimate so row height is driven by content + measureElement; a large value would force a high minHeight and block adaptive padding.
  const COLLECTION_ROW_ESTIMATE = 180;
  const collectionVirtualizer = useVirtualizer({
    count: collectionRowCount,
    getScrollElement: () => collectionScrollRef.current,
    estimateSize: () => COLLECTION_ROW_ESTIMATE,
    gap: 12,
    overscan: 3,
  });

  const [inspectView, setInspectView] = useState<{ index: number; maxIndex: number } | null>(null);
  const [inspectPhase, setInspectPhase] = useState<'entering' | 'idle' | 'exiting'>('idle');
  const [inspectOriginRect, setInspectOriginRect] = useState<CardRect | null>(null);
  const [inspectExitRect, setInspectExitRect] = useState<CardRect | null>(null);
  const inspectCardRef = useRef<HTMLDivElement>(null);
  const inspectCloseRef = useRef<() => void>(() => {});
  const inspectFinishCloseRef = useRef<() => void>(() => {});
  const inspectPhaseRef = useRef<'entering' | 'idle' | 'exiting'>('idle');
  const inspectNavigateRef = useRef<{ goPrev: () => void; goNext: () => void }>({ goPrev: () => {}, goNext: () => {} });
  const INSPECT_ANIM_MS = 280;
  const INSPECT_SLIDE_MS = 250;
  // Ease-in-out so card eases into motion and eases to a stop (no abrupt start or end)
  const INSPECT_EASING = 'cubic-bezier(0.45, 0, 0.55, 1)';
  const [inspectSliding, setInspectSliding] = useState<{ fromIndex: number; toIndex: number } | null>(null);
  const [inspectSlidePhase, setInspectSlidePhase] = useState<'start' | 'end'>('start');

  useEffect(() => {
    inspectPhaseRef.current = inspectPhase;
  }, [inspectPhase]);

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

  // Rotate loading hint text (no recent repetition) while Clerk is loading
  useEffect(() => {
    if (!clerkEnabled || isUserLoaded) return;
    loadingHintRecentRef.current = [loadingHint];
    const intervalId = setInterval(() => {
      const next = getNextHint(loadingHintRecentRef.current);
      setLoadingHint(next);
      loadingHintRecentRef.current = loadingHintRecentRef.current.slice(-(LOADING_HINT_RECENT_COUNT - 1)).concat(next);
    }, 2500);
    return () => clearInterval(intervalId);
  }, [clerkEnabled, isUserLoaded]);

  const setSyncError = (message: string) => {
    setSyncStatus('error');
    setSyncErrorMessage(message);
  };

  const clearSyncError = () => setSyncErrorMessage(null);

  const isSupabaseConfigured = Boolean(COLLECTION_API_BASE);

  // 1. When signed in: load collection from Edge Function; if guest data exists, show prompt instead of auto-merging
  useEffect(() => {
    if (!clerkUser?.id || !COLLECTION_API_BASE) return;
    if (hasLoadedFromCloudRef.current) return;

    const guestData = getGuestCollection();
    const hadGuestData = Object.keys(guestData).length > 0;

    if (!hadGuestData) {
      hasLoadedFromCloudRef.current = true;
      let cancelled = false;
      (async () => {
        try {
          const token = await session?.getToken();
          if (!token || cancelled) return;
          setSyncStatus('syncing');
          const cloudData = await loadCollectionFromApi(token, COLLECTION_API_BASE);
          if (cancelled) return;
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
    }

    setGuestMergePrompt('loading');
    let cancelled = false;
    (async () => {
      try {
        const token = await session?.getToken();
        if (!token || cancelled) return;
        setSyncStatus('syncing');
        const cloudData = await loadCollectionFromApi(token, COLLECTION_API_BASE);
        if (cancelled) return;
        setCloudDataForMerge(cloudData ?? {});
        setGuestMergePrompt('open');
        setSyncStatus('idle');
      } catch (e) {
        if (!cancelled) {
          setSyncError(`Sync failed: ${getSyncErrorMessage(e)}`);
          setGuestMergePrompt('idle');
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [clerkUser?.id, session, COLLECTION_API_BASE]);

  // 2. When user signs out or not signed in: switch to guest collection from localStorage; do not redirect
  useEffect(() => {
    if (!isUserLoaded) return;
    if (!clerkUser) {
      hasLoadedFromCloudRef.current = false;
      setCollection(getGuestCollection());
    }
  }, [clerkUser, isUserLoaded]);

  // 3. When guest and collection changes: persist to localStorage (debounced)
  useEffect(() => {
    if (clerkUser != null) return;
    const t = setTimeout(() => setGuestCollection(collection), 1000);
    return () => clearTimeout(t);
  }, [clerkUser, collection]);

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

  const handleGuestMergeMerge = useCallback(() => {
    const cloud = cloudDataForMerge ?? {};
    const guest = getGuestCollection();
    const merged: CollectionState = { ...cloud };
    for (const [cardId, guestCount] of Object.entries(guest)) {
      const cloudCount = merged[cardId] ?? 0;
      merged[cardId] = cloudCount + guestCount;
    }
    setCollection(merged);
    clearGuestCollection();
    setCloudDataForMerge(null);
    setGuestMergePrompt('idle');
    hasLoadedFromCloudRef.current = true;
    setSyncStatus('syncing');
    clearSyncError();
    // Auto-save will run from collection change and then show saved
  }, [cloudDataForMerge]);

  const handleGuestMergeUseCloudOnly = useCallback(() => {
    const cloud = cloudDataForMerge ?? {};
    justLoadedFromCloudRef.current = true;
    setCollection(cloud);
    setCloudDataForMerge(null);
    setGuestMergePrompt('idle');
    hasLoadedFromCloudRef.current = true;
    setSyncStatus('saved');
    clearSyncError();
    setTimeout(() => setSyncStatus('idle'), 3000);
  }, [cloudDataForMerge]);

  const handleGuestMergeCancel = useCallback(() => {
    setCloudDataForMerge(null);
    setGuestMergePrompt('idle');
    signOut?.();
  }, []);

  const handleDismissDemoBanner = useCallback(() => {
    setDemoBannerDismissed(true);
    setShowDismissedToast(true);
  }, []);

  const handleDontShowDemoBannerAgain = useCallback(() => {
    try {
      window.localStorage.setItem(DEMO_BANNER_DONT_SHOW_KEY, '1');
    } catch {
      // ignore
    }
    setDemoBannerDontShow(true);
    setShowDismissedToast(false);
  }, []);

  const handleDismissToast = useCallback(() => {
    setShowDismissedToast(false);
  }, []);

  useEffect(() => {
    if (!showDismissedToast) return;
    const t = setTimeout(() => {
      setShowDismissedToast(false);
    }, DISMISSED_TOAST_DURATION_SEC * 1000);
    return () => clearTimeout(t);
  }, [showDismissedToast]);

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

      {!clerkUser && clerkLoadTimedOut && (
        <div className="text-sm text-center text-gray-500 space-y-1">
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
        </div>
      )}

      <Button
        variant="primary"
        size="lg"
        fullWidth
        onClick={() => navigate(lastCollectionSetSlug ? `/collection/${lastCollectionSetSlug}` : '/collection')}
        className="h-24 flex flex-col items-center justify-center gap-1 py-5 group"
      >
        <Library className="size-8 shrink-0 group-hover:scale-110 transition-transform" />
        <span className="text-lg">My Collection</span>
        {lastCollectionSetSlug != null && (() => {
          const set = getSetBySlug(lastCollectionSetSlug);
          return set ? <span className="text-[10px] text-gray-200 font-normal leading-tight">{set.name}</span> : null;
        })()}
      </Button>

      <Button
        variant="secondary"
        size="lg"
        fullWidth
        onClick={() => navigate('/statistics')}
        className="h-24 flex flex-col items-center justify-center gap-1 group bg-gray-800 border-gray-700"
      >
        <BarChart3 className="group-hover:scale-110 transition-transform text-green-400" />
        <span className="text-lg">Statistics</span>
      </Button>

      {!isSupabaseConfigured && (
        <p className="text-xs text-center text-amber-500 mt-4">
          Cloud sync is unavailable: add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to your environment (e.g. .env.local or deployment secrets).
        </p>
      )}
    </div>
  );

  // Transition from 'entering' to 'idle' so CSS animates card from origin to center
  useEffect(() => {
    if (inspectPhase !== 'entering' || !inspectView) return;
    const frame = requestAnimationFrame(() => {
      requestAnimationFrame(() => setInspectPhase('idle'));
    });
    return () => cancelAnimationFrame(frame);
  }, [inspectPhase, inspectView]);

  // Trigger slide animation: start at "start" positions, then set "end" so cards animate (outgoing slides out + fade, incoming slides in + fade). Clear sliding state when done.
  useEffect(() => {
    if (!inspectSliding) return;
    setInspectSlidePhase('start');
    const frame = requestAnimationFrame(() => {
      requestAnimationFrame(() => setInspectSlidePhase('end'));
    });
    const done = setTimeout(() => {
      setInspectSliding(null);
      setInspectSlidePhase('start');
      // If user started close while sliding, we just cleared sliding; finish close so overlay doesn't stick.
      if (inspectPhaseRef.current === 'exiting') {
        inspectFinishCloseRef.current();
      }
    }, INSPECT_SLIDE_MS);
    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(done);
    };
  }, [inspectSliding]);

  // Close Inspect View when leaving collection or when current index becomes invalid (e.g. filter change)
  useEffect(() => {
    if (!location.pathname.startsWith('/collection')) {
      setInspectView(null);
      setInspectPhase('idle');
      setInspectOriginRect(null);
      setInspectExitRect(null);
      setInspectSliding(null);
      setInspectSlidePhase('start');
      return;
    }
    if (inspectView == null) return;
    const filtered = CARDS.filter(card => {
      const matchesSet = selectedSetId === 'ALL' || card.set === selectedSetId;
      const matchesSearch =
        card.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        String(card.number).includes(searchQuery);
      const isOwned = (collection[card.id] || 0) > 0;
      if (filterOwned === 'owned' && !isOwned) return false;
      if (filterOwned === 'missing' && isOwned) return false;
      return matchesSet && matchesSearch;
    });
    const maxIndex = filtered.length - 1;
    if (inspectView.index < 0 || inspectView.index > maxIndex) {
      setInspectView(null);
      setInspectPhase('idle');
      setInspectOriginRect(null);
      setInspectExitRect(null);
      setInspectSliding(null);
      setInspectSlidePhase('start');
    }
  }, [location.pathname, inspectView, selectedSetId, searchQuery, filterOwned, collection]);

  // Keyboard: Escape to close Inspect View (animated), Arrow Left/Right to navigate (only on collection when inspect open)
  useEffect(() => {
    if (location.pathname !== '/collection' || !inspectView) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        inspectCloseRef.current();
        return;
      }
      if (e.key === 'ArrowLeft') {
        inspectNavigateRef.current.goPrev();
        return;
      }
      if (e.key === 'ArrowRight') {
        inspectNavigateRef.current.goNext();
        return;
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [location.pathname, inspectView]);

  const closeCollectionSetDropdownAndFocusSearch = useCallback(() => {
    setCollectionSetDropdownOpen(false);
    setTimeout(() => collectionSearchInputRef.current?.focus(), 0);
  }, []);

  const focusSearchAndSelectAll = useCallback(() => {
    setTimeout(() => {
      const input = collectionSearchInputRef.current;
      if (input) {
        input.focus();
        input.select();
      }
    }, 0);
  }, []);

  // When dropdown opens, set focused index to selected option and scroll selected into view
  useEffect(() => {
    if (!collectionSetDropdownOpen) return;
    const selectedIndex = selectedSetId === 'ALL' ? 0 : (SETS.findIndex((s) => s.id === selectedSetId) + 1);
    if (selectedIndex > SETS.length) setCollectionSetDropdownFocusedIndex(0);
    else setCollectionSetDropdownFocusedIndex(selectedIndex >= 0 ? selectedIndex : 0);
    const listbox = collectionSetListboxRef.current;
    if (listbox) {
      const scroll = () => {
        const selected = listbox.querySelector('[aria-selected="true"]');
        (selected as HTMLElement)?.scrollIntoView({ block: 'nearest' });
      };
      requestAnimationFrame(scroll);
    }
  }, [collectionSetDropdownOpen, selectedSetId]);

  // When dropdown is open and focused index changes, focus that option
  useEffect(() => {
    if (!collectionSetDropdownOpen) return;
    const option = collectionSetListboxRef.current?.querySelector(`[data-index="${collectionSetDropdownFocusedIndex}"]`) as HTMLElement | null;
    option?.focus();
  }, [collectionSetDropdownOpen, collectionSetDropdownFocusedIndex]);

  // Close collection set dropdown on click outside or Escape; keyboard navigation when open
  useEffect(() => {
    if (!collectionSetDropdownOpen) return;
    const handleOutside = (e: MouseEvent | TouchEvent) => {
      const el = collectionSetDropdownRef.current;
      if (el && !el.contains(e.target as Node)) closeCollectionSetDropdownAndFocusSearch();
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        closeCollectionSetDropdownAndFocusSearch();
        e.preventDefault();
        return;
      }
      const optionCount = SETS.length + 1;
      if (e.key === 'ArrowDown') {
        setCollectionSetDropdownFocusedIndex((i) => (i + 1) % optionCount);
        e.preventDefault();
        return;
      }
      if (e.key === 'ArrowUp') {
        setCollectionSetDropdownFocusedIndex((i) => (i - 1 + optionCount) % optionCount);
        e.preventDefault();
        return;
      }
      if (e.key === 'Home') {
        setCollectionSetDropdownFocusedIndex(0);
        e.preventDefault();
        return;
      }
      if (e.key === 'End') {
        setCollectionSetDropdownFocusedIndex(SETS.length);
        e.preventDefault();
        return;
      }
      if (e.key === 'Enter') {
        if (collectionSetDropdownFocusedIndex === 0) {
          navigate('/collection');
        } else {
          const set = SETS[collectionSetDropdownFocusedIndex - 1];
          if (set) {
            const slug = getSetSlug(set.id);
            if (slug != null) navigate(`/collection/${slug}`);
          }
        }
        closeCollectionSetDropdownAndFocusSearch();
        e.preventDefault();
      }
    };
    document.addEventListener('mousedown', handleOutside);
    document.addEventListener('touchstart', handleOutside, { passive: true });
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleOutside);
      document.removeEventListener('touchstart', handleOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [collectionSetDropdownOpen, closeCollectionSetDropdownAndFocusSearch, collectionSetDropdownFocusedIndex, navigate]);

  // Close collection set dropdown when leaving collection route
  useEffect(() => {
    if (!location.pathname.startsWith('/collection')) setCollectionSetDropdownOpen(false);
  }, [location.pathname]);

  const renderCollection = () => {
    const filteredCards = collectionFilteredCards;
    const currentInspectCard = inspectView != null ? filteredCards[inspectView.index] ?? null : null;
    const canGoLeft = inspectView != null && inspectView.index > 0;
    const canGoRight = inspectView != null && inspectView.index < inspectView.maxIndex;

    const startCloseInspect = () => {
      if (!currentInspectCard) {
        finishCloseInspect();
        return;
      }
      // If we're mid-slide, clear sliding state so we render the single card and run the exit animation (avoids stuck overlay).
      setInspectSliding(null);
      setInspectSlidePhase('start');
      const el = document.querySelector(`[data-card-rect-id="${currentInspectCard.id}"]`);
      const rect = el?.getBoundingClientRect();
      if (rect) {
        setInspectExitRect({
          left: rect.left,
          top: rect.top,
          width: rect.width,
          height: rect.height,
        });
        // Defer 'exiting' so the single card paints at center first, then animates to grid (otherwise no transition runs).
        requestAnimationFrame(() => setInspectPhase('exiting'));
      } else {
        setInspectExitRect(null);
        setInspectPhase('exiting');
      }
    };

    const finishCloseInspect = () => {
      setInspectView(null);
      setInspectPhase('idle');
      setInspectOriginRect(null);
      setInspectExitRect(null);
      setInspectSliding(null);
      setInspectSlidePhase('start');
    };

    inspectCloseRef.current = startCloseInspect;
    inspectFinishCloseRef.current = finishCloseInspect;

    inspectNavigateRef.current = {
      goPrev: () => {
        if (!inspectView || inspectView.index <= 0) return;
        const nextIndex = inspectView.index - 1;
        setInspectSlidePhase('start');
        setInspectSliding({ fromIndex: inspectView.index, toIndex: nextIndex });
        setInspectView(v => (v ? { ...v, index: nextIndex } : v));
      },
      goNext: () => {
        if (!inspectView || inspectView.index >= inspectView.maxIndex) return;
        const nextIndex = inspectView.index + 1;
        setInspectSlidePhase('start');
        setInspectSliding({ fromIndex: inspectView.index, toIndex: nextIndex });
        setInspectView(v => (v ? { ...v, index: nextIndex } : v));
      },
    };

    // Grayscale matches grid: unowned cards are grayscale; interpolate to/from color during open/close
    const inspectCardOwned = currentInspectCard ? (collection[currentInspectCard.id] ?? 0) > 0 : false;
    const grayscaleAtGrid = inspectCardOwned ? 0 : 1;

    // Card dimensions for idle and for sliding cards (same as idle branch)
    const getInspectCardDimensions = (): { w: number; h: number } => {
      if (typeof window === 'undefined') return { w: 280, h: 392 };
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const maxW = Math.min(280, vw - 112);
      const w = Math.max(160, maxW);
      const maxH = vh - 128;
      const h = Math.min((w * 3.5) / 2.5, maxH);
      return { w, h };
    };

    // Card position/size for the three phases (entering: from grid, idle: center large, exiting: back to grid or shrink)
    const getInspectCardStyle = (): React.CSSProperties => {
      const base: React.CSSProperties = {
        transition: `left ${INSPECT_ANIM_MS}ms ${INSPECT_EASING}, top ${INSPECT_ANIM_MS}ms ${INSPECT_EASING}, width ${INSPECT_ANIM_MS}ms ${INSPECT_EASING}, height ${INSPECT_ANIM_MS}ms ${INSPECT_EASING}, transform ${INSPECT_ANIM_MS}ms ${INSPECT_EASING}, opacity ${INSPECT_ANIM_MS}ms ${INSPECT_EASING}, filter ${INSPECT_ANIM_MS}ms ${INSPECT_EASING}`,
        position: 'fixed',
        borderRadius: '0.5rem',
        overflow: 'hidden',
        border: '2px solid rgb(55 65 81)',
        backgroundColor: 'rgb(17 24 39)',
        boxShadow: '0 25px 50px -12px rgb(0 0 0 / 0.5)',
      };
      if (inspectPhase === 'entering' && inspectOriginRect) {
        return {
          ...base,
          left: inspectOriginRect.left,
          top: inspectOriginRect.top,
          width: inspectOriginRect.width,
          height: inspectOriginRect.height,
          transform: 'none',
          filter: `grayscale(${grayscaleAtGrid})`,
        };
      }
      if (inspectPhase === 'exiting') {
        if (inspectExitRect) {
          return {
            ...base,
            left: inspectExitRect.left,
            top: inspectExitRect.top,
            width: inspectExitRect.width,
            height: inspectExitRect.height,
            transform: 'none',
            filter: `grayscale(${grayscaleAtGrid})`,
          };
        }
        return {
          ...base,
          left: '50%',
          top: '50%',
          width: 320,
          height: 448,
          transform: 'translate(-50%, -50%) scale(0)',
          opacity: 0,
          filter: `grayscale(${grayscaleAtGrid})`,
        };
      }
      // idle: centered, smaller so card never overlaps side arrows or top/bottom chrome (56px sides, 64px top/bottom)
      if (typeof window === 'undefined') {
        return {
          ...base,
          left: '50%',
          top: '50%',
          width: 280,
          height: 392,
          transform: 'translate(-50%, -50%)',
          filter: 'grayscale(0)',
        };
      }
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const maxW = Math.min(280, vw - 112);
      const w = Math.max(160, maxW);
      const maxH = vh - 128;
      const h = Math.min((w * 3.5) / 2.5, maxH);
      return {
        ...base,
        left: '50%',
        top: '50%',
        width: w,
        height: h,
        transform: 'translate(-50%, -50%)',
        filter: 'grayscale(0)',
      };
    };

    return (
      <div className="flex flex-col h-screen bg-black">
        {/* Inspect View overlay */}
        {inspectView != null && currentInspectCard && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-md"
            onClick={startCloseInspect}
            role="dialog"
            aria-modal="true"
            aria-label="Inspect View"
          >
            {/* Preload adjacent card images so sliding doesn't trigger load glitches */}
            {inspectView.index > 0 && filteredCards[inspectView.index - 1]?.image && (
              <img
                src={filteredCards[inspectView.index - 1].image}
                alt=""
                aria-hidden
                className="absolute opacity-0 pointer-events-none w-0 h-0 overflow-hidden"
                loading="eager"
              />
            )}
            {inspectView.index < inspectView.maxIndex && filteredCards[inspectView.index + 1]?.image && (
              <img
                src={filteredCards[inspectView.index + 1].image}
                alt=""
                aria-hidden
                className="absolute opacity-0 pointer-events-none w-0 h-0 overflow-hidden"
                loading="eager"
              />
            )}
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); startCloseInspect(); }}
              className="absolute top-4 right-4 z-10 p-2 rounded-full text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
              aria-label="Close"
            >
              <X size={24} />
            </button>
            {canGoLeft && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  if (!inspectView || inspectView.index <= 0) return;
                  const nextIndex = inspectView.index - 1;
                  setInspectSlidePhase('start');
                  setInspectSliding({ fromIndex: inspectView.index, toIndex: nextIndex });
                  setInspectView(v => v ? { ...v, index: nextIndex } : v);
                }}
                className="absolute left-3 top-1/2 -translate-y-1/2 z-10 p-2 text-gray-400 hover:text-white transition-colors touch-manipulation"
                aria-label="Previous card"
              >
                <ChevronLeft size={24} />
              </button>
            )}
            {canGoRight && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  if (!inspectView || inspectView.index >= inspectView.maxIndex) return;
                  const nextIndex = inspectView.index + 1;
                  setInspectSlidePhase('start');
                  setInspectSliding({ fromIndex: inspectView.index, toIndex: nextIndex });
                  setInspectView(v => v ? { ...v, index: nextIndex } : v);
                }}
                className="absolute right-3 top-1/2 -translate-y-1/2 z-10 p-2 text-gray-400 hover:text-white transition-colors touch-manipulation"
                aria-label="Next card"
              >
                <ChevronRight size={24} />
              </button>
            )}
            {inspectSliding ? (
              (() => {
                const dims = getInspectCardDimensions();
                const goingNext = inspectSliding.toIndex > inspectSliding.fromIndex;
                // fromIndex = index we're leaving, toIndex = index we're going to (same for both next and prev).
                const outgoingCardIndex = inspectSliding.fromIndex;
                const incomingCardIndex = inspectSliding.toIndex;
                const baseCardStyle: React.CSSProperties = {
                  position: 'fixed',
                  left: '50%',
                  top: '50%',
                  width: dims.w,
                  height: dims.h,
                  marginLeft: -dims.w / 2,
                  marginTop: -dims.h / 2,
                  borderRadius: '0.5rem',
                  overflow: 'hidden',
                  border: '2px solid rgb(55 65 81)',
                  backgroundColor: 'rgb(17 24 39)',
                  boxShadow: '0 25px 50px -12px rgb(0 0 0 / 0.5)',
                  transition: inspectSlidePhase === 'start'
                    ? 'none'
                    : `transform ${INSPECT_SLIDE_MS}ms ease-out, opacity ${INSPECT_SLIDE_MS}ms ease-out`,
                  pointerEvents: 'none',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                };
                const atEnd = inspectSlidePhase === 'end';
                const outgoingStyle: React.CSSProperties = {
                  ...baseCardStyle,
                  transform: atEnd
                    ? (goingNext ? 'translate(-100%, 0)' : 'translate(100%, 0)')
                    : 'translate(0, 0)',
                  opacity: atEnd ? 0 : 1,
                };
                const incomingStyle: React.CSSProperties = {
                  ...baseCardStyle,
                  transform: atEnd
                    ? 'translate(0, 0)'
                    : goingNext
                      ? 'translate(100%, 0)'
                      : 'translate(-100%, 0)',
                  opacity: atEnd ? 1 : 0,
                };
                return (
                  <>
                    <div style={outgoingStyle}>
                      <img
                        key={filteredCards[outgoingCardIndex]?.id ?? 'out'}
                        src={filteredCards[outgoingCardIndex]?.image ?? ''}
                        alt={filteredCards[outgoingCardIndex]?.name ?? ''}
                        className="w-full h-full object-contain pointer-events-none"
                        loading="eager"
                        decoding="async"
                      />
                    </div>
                    <div style={incomingStyle}>
                      <img
                        key={filteredCards[incomingCardIndex]?.id ?? 'in'}
                        src={filteredCards[incomingCardIndex]?.image ?? ''}
                        alt={filteredCards[incomingCardIndex]?.name ?? ''}
                        className="w-full h-full object-contain pointer-events-none"
                        loading="eager"
                        decoding="async"
                      />
                    </div>
                  </>
                );
              })()
            ) : (
              <div
                ref={inspectCardRef}
                style={getInspectCardStyle()}
                onTransitionEnd={(e) => {
                  if (e.target === inspectCardRef.current && inspectPhase === 'exiting') finishCloseInspect();
                }}
                onClick={(e) => e.stopPropagation()}
                className="flex items-center justify-center overflow-hidden"
              >
                <img
                  src={currentInspectCard.image}
                  alt={currentInspectCard.name}
                  className="w-full h-full object-contain pointer-events-none"
                  loading="eager"
                  decoding="async"
                />
              </div>
            )}
            <div
              className="absolute bottom-8 left-0 right-0 flex flex-col items-center px-4 pointer-events-none"
              style={{ transition: `opacity ${INSPECT_ANIM_MS}ms ease-out` }}
            >
              <p className="text-lg font-medium text-white truncate max-w-full text-center drop-shadow-lg">{currentInspectCard.name}</p>
              <p className="text-sm text-gray-500">{selectedSetId === 'ALL' ? `${SETS.find(s => s.id === currentInspectCard.set)?.name ?? currentInspectCard.set} #${currentInspectCard.number}` : `#${currentInspectCard.number}`}</p>
            </div>
          </div>
        )}

        <div className="sticky top-0 z-30 bg-black shrink-0 border-b border-gray-800 p-4 space-y-3 backdrop-blur-md">
          <div className="flex items-center gap-3">
            <button onClick={() => navigate('/')} className="p-2 -ml-2 text-gray-400 hover:text-white">
              <ChevronLeft />
            </button>
            <h2 className="text-xl font-bold hidden min-[584px]:block">Collection</h2>
            <div
              ref={collectionSetDropdownRef}
              className="relative flex-none min-w-0 shrink max-w-full"
              style={{ width: collectionSetDropdownWidth ?? 240 }}
            >
              <button
                type="button"
                onClick={() => setCollectionSetDropdownOpen((o) => !o)}
                aria-expanded={collectionSetDropdownOpen}
                aria-haspopup="listbox"
                aria-label="Select set"
                className="group/dropdown w-full flex items-center justify-between gap-2 bg-gray-900 border border-gray-700 text-white text-sm rounded-lg px-3 py-2 outline-none transition-colors hover:bg-gray-800 hover:border-gray-600 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 truncate min-h-[40px]"
              >
                <span className="truncate">
                  {selectedSetId === 'ALL' ? 'All Sets' : (SETS.find((s) => s.id === selectedSetId)?.name ?? selectedSetId)}
                </span>
                <span className="flex items-center gap-2 shrink-0">
                  {selectedSetId !== 'ALL' && (
                    <span className="hidden headerNarrow:inline shrink-0 text-xs font-mono text-gray-400 bg-gray-800 group-hover/dropdown:bg-gray-900 px-2 py-0.5 rounded transition-colors">{SETS.find((s) => s.id === selectedSetId)?.id ?? selectedSetId}</span>
                  )}
                  <ChevronDown
                    size={16}
                    className={`text-gray-400 transition-transform ${collectionSetDropdownOpen ? 'rotate-180' : ''}`}
                  />
                </span>
              </button>
              {collectionSetDropdownOpen && (
                <div
                  ref={collectionSetListboxRef}
                  role="listbox"
                  className="absolute top-full left-0 right-0 mt-1 bg-gray-900 border border-gray-700 rounded-lg shadow-xl max-h-[min(60vh,320px)] overflow-y-auto py-1 z-50"
                >
                  <button
                    type="button"
                    role="option"
                    aria-selected={selectedSetId === 'ALL'}
                    data-index={0}
                    onClick={() => {
                      navigate('/collection');
                      closeCollectionSetDropdownAndFocusSearch();
                    }}
                    className={`w-full flex items-center justify-between gap-2 px-3 py-2.5 text-left text-sm transition-colors hover:bg-blue-900/40 focus:bg-blue-900/40 focus:outline-none ${selectedSetId === 'ALL' ? 'bg-blue-900/90 text-white' : 'text-gray-200'}`}
                  >
                    <span className="truncate">All Sets</span>
                  </button>
                  {SETS.map((set, index) => {
                    const isSelected = selectedSetId === set.id;
                    return (
                      <button
                        key={set.id}
                        type="button"
                        role="option"
                        aria-selected={isSelected}
                        data-index={index + 1}
                        onClick={() => {
                          const slug = getSetSlug(set.id);
                          if (slug != null) navigate(`/collection/${slug}`);
                          closeCollectionSetDropdownAndFocusSearch();
                        }}
                        className={`w-full flex items-center justify-between gap-2 px-3 py-2.5 text-left text-sm transition-colors hover:bg-blue-900/40 focus:bg-blue-900/40 focus:outline-none ${isSelected ? 'bg-blue-900/90 text-white' : 'text-gray-200'}`}
                      >
                        <span className="truncate">{set.name}</span>
                        <span className="shrink-0 text-xs font-mono text-gray-400 bg-gray-800 px-2 py-0.5 rounded">{set.id}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
            {(() => {
              const progress = getCollectionProgress(collection, selectedSetId);
              const statsHash = selectedSetId === 'ALL' ? 'allsets' : (getSetSlug(selectedSetId) ?? selectedSetId);
              return (
                <>
                  {/* Progress region: clickable, same height as dropdown, navigates to Statistics and scrolls to this set */}
                  <button
                    type="button"
                    onClick={() => navigate(`/statistics#${statsHash}`)}
                    className="group/progress flex min-h-[40px] min-w-[3rem] items-center gap-2 px-3 py-2 sm:flex-1 rounded-lg border border-gray-700 bg-gray-900 text-left outline-none transition-colors hover:bg-gray-800 hover:border-gray-600 cursor-pointer focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-black focus:border-blue-500"
                    aria-label={`View ${selectedSetId === 'ALL' ? 'All Sets' : 'set'} in Statistics`}
                  >
                    <span className="text-xs font-medium text-blue-400 shrink-0 tabular-nums">{Math.floor(progress.percentage)}%</span>
                    <div className="hidden sm:block flex-1 min-w-[48px] h-3 bg-gray-800 group-hover/progress:bg-gray-900 rounded-full overflow-hidden transition-colors">
                      <div
                        className="bg-gradient-to-r from-blue-600 to-purple-500 h-full rounded-full transition-all duration-1000 ease-out"
                        style={{ width: `${Math.floor(progress.percentage)}%` }}
                      />
                    </div>
                  </button>
                  {/* Both labels always visible; no shortening */}
                  <div className="ml-auto text-right shrink-0">
                    <div className="text-xs text-gray-500 whitespace-nowrap">
                      {progress.owned} / {progress.total}
                    </div>
                    <div className="text-[10px] text-gray-500 whitespace-nowrap">
                      {progress.totalCopies} total
                    </div>
                  </div>
                </>
              );
            })()}
          </div>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={16} />
              <input
                ref={collectionSearchInputRef}
                type="text"
                placeholder="Search..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onFocus={(e) => e.target.select()}
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
        <div
          ref={collectionScrollRef}
          className="flex-1 min-h-0 overflow-y-auto"
        >
        <div className="p-4 pb-24 touch-pan-y relative">
          {filteredCards.length === 0 ? (
            <div className="py-20 text-center text-gray-500 flex flex-col items-center">
              <p>No cards found.</p>
            </div>
          ) : filteredCards.length > 50 ? (
            <>
              <div
                style={{
                  height: collectionVirtualizer.getTotalSize(),
                  position: 'relative',
                  width: '100%',
                  marginTop: 16,
                  marginBottom: 96,
                }}
              >
              {collectionVirtualizer.getVirtualItems().map((virtualRow) => (
                <div
                  key={virtualRow.key}
                  ref={collectionVirtualizer.measureElement}
                  data-index={virtualRow.index}
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    transform: `translateY(${virtualRow.start}px)`,
                  }}
                  className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-3 md:gap-4 select-none"
                >
                  {filteredCards
                    .slice(
                      virtualRow.index * collectionColumnCount,
                      (virtualRow.index + 1) * collectionColumnCount
                    )
                    .map((card, i) => {
                      const index = virtualRow.index * collectionColumnCount + i;
                      return (
                        <CardItem
                          key={card.id}
                          card={card}
                          count={collection[card.id] || 0}
                          showSetInNumber={selectedSetId === 'ALL'}
                          setName={selectedSetId === 'ALL' ? SETS.find(s => s.id === card.set)?.name : undefined}
                          onIncrement={(searchWasFocused) => {
                            handleUpdateCount(card.id, 1);
                            if (searchWasFocused) focusSearchAndSelectAll();
                          }}
                          onDecrement={(searchWasFocused) => {
                            handleUpdateCount(card.id, -1);
                            if (searchWasFocused) focusSearchAndSelectAll();
                          }}
                          searchInputRef={collectionSearchInputRef}
                          onLongPress={(rect) => {
                            setInspectOriginRect(rect);
                            setInspectExitRect(null);
                            setInspectView({ index, maxIndex: filteredCards.length - 1 });
                            setInspectPhase('entering');
                          }}
                        />
                      );
                    })}
                </div>
              ))}
              </div>
            </>
          ) : (
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-3 md:gap-4 select-none">
              {filteredCards.map((card, index) => (
                <CardItem
                  key={card.id}
                  card={card}
                  count={collection[card.id] || 0}
                  showSetInNumber={selectedSetId === 'ALL'}
                  setName={selectedSetId === 'ALL' ? SETS.find(s => s.id === card.set)?.name : undefined}
                  onIncrement={(searchWasFocused) => {
                    handleUpdateCount(card.id, 1);
                    if (searchWasFocused) focusSearchAndSelectAll();
                  }}
                  onDecrement={(searchWasFocused) => {
                    handleUpdateCount(card.id, -1);
                    if (searchWasFocused) focusSearchAndSelectAll();
                  }}
                  searchInputRef={collectionSearchInputRef}
                  onLongPress={(rect) => {
                  setInspectOriginRect(rect);
                  setInspectExitRect(null);
                  setInspectView({ index, maxIndex: filteredCards.length - 1 });
                  setInspectPhase('entering');
                }}
                />
              ))}
            </div>
          )}
        </div>
        </div>
      </div>
    );
  };

  const renderStats = () => (
    <div className="flex flex-col h-screen min-h-0 overflow-y-auto">
      <div className="sticky top-0 z-30 bg-black shrink-0 border-b border-gray-800 p-4 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/')} className="p-2 -ml-2 text-gray-400 hover:text-white">
            <ChevronLeft />
          </button>
          <h2 className="text-xl font-bold">Statistics</h2>
        </div>
      </div>
      <div className="p-6 space-y-6 pb-12">
        {/* All Sets: always first, links to /collection. Percentile rounded down to hundredths, two decimal places. */}
        {(() => {
          const allStats = getCollectionProgress(collection, 'ALL');
          const allPct = Math.floor(allStats.percentage * 100) / 100;
          return (
            <button
              type="button"
              id="allsets"
              onClick={() => navigate('/collection')}
              className={`scroll-mt-24 w-full text-left bg-gray-900 border rounded-xl p-5 shadow-lg transition-colors hover:bg-gray-700 hover:border-gray-600 cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-black ${statsFlashTargetId === 'allsets' ? 'ring-2 ring-blue-500 border-blue-500' : 'border-gray-800'}`}
            >
              <div className="flex items-center justify-between mb-4 gap-3">
                <div className="flex items-center gap-2 min-w-0">
                  <h3 className="text-lg font-bold text-white truncate">All Sets</h3>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-xs text-gray-500 whitespace-nowrap">{allStats.owned} / {allStats.total}</div>
                  <div className="text-[10px] text-gray-500 whitespace-nowrap">{allStats.totalCopies} total</div>
                </div>
              </div>
              <div className="w-full bg-gray-800 rounded-full h-4 overflow-hidden">
                <div
                  className="bg-gradient-to-r from-blue-600 to-purple-500 h-full rounded-full transition-all duration-1000 ease-out"
                  style={{ width: `${allPct}%` }}
                />
              </div>
              <div className="mt-2 text-right">
                <span className="text-sm font-medium text-blue-400">{allPct.toFixed(2)}% Complete</span>
              </div>
            </button>
          );
        })()}
        {SETS.map(set => {
          const stats = getSetProgress(set.id, collection);
          const slug = getSetSlug(set.id);
          const pct = Math.floor(stats.percentage * 100) / 100;
          return (
            <button
              key={set.id}
              type="button"
              id={slug ?? set.id}
              onClick={() => slug != null && navigate(`/collection/${slug}`)}
              className={`scroll-mt-24 w-full text-left bg-gray-900 border rounded-xl p-5 shadow-lg transition-colors hover:bg-gray-700 hover:border-gray-600 cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-black ${statsFlashTargetId === (slug ?? set.id) ? 'ring-2 ring-blue-500 border-blue-500' : 'border-gray-800'}`}
            >
              <div className="flex items-center justify-between mb-4 gap-3">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="shrink-0 text-xs font-mono text-gray-400 bg-gray-800 px-2 py-0.5 rounded">
                    {set.id}
                  </span>
                  <h3 className="text-lg font-bold text-white truncate">{set.name}</h3>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-xs text-gray-500 whitespace-nowrap">{stats.owned} / {stats.total}</div>
                  <div className="text-[10px] text-gray-500 whitespace-nowrap">{stats.totalCopies} total</div>
                </div>
              </div>
              <div className="w-full bg-gray-800 rounded-full h-4 overflow-hidden">
                <div
                  className="bg-gradient-to-r from-blue-600 to-purple-500 h-full rounded-full transition-all duration-1000 ease-out"
                  style={{ width: `${pct}%` }}
                />
              </div>
              <div className="mt-2 text-right">
                <span className="text-sm font-medium text-blue-400">{pct.toFixed(2)}% Complete</span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );

  // Full-screen loading animation until app is ready (Clerk loaded when enabled)
  if (clerkEnabled && !isUserLoaded) {
    return (
      <div
        className="min-h-screen bg-black text-white font-sans flex flex-col items-center justify-center gap-6"
        aria-busy="true"
        aria-label="Loading"
      >
        <span className="text-2xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-purple-400">
          PocketDex
        </span>
        <div
          className="w-8 h-8 rounded-full border-2 border-white/15 border-t-purple-400 animate-spin"
          aria-hidden="true"
        />
        <span className="text-sm text-gray-500">{loadingHint}</span>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-white font-sans overflow-hidden flex flex-col">
      {!clerkUser && !demoBannerDismissed && !demoBannerDontShow && (
        <div className="sticky top-0 z-40 shrink-0 flex items-center justify-between gap-3 px-4 py-2 bg-amber-500/15 border-b border-amber-500/30 text-sm">
          <span className="text-amber-200">You&apos;re exploring in demo mode, where your on-device data is at risk of being deleted. Sign in to save your collection to the cloud.</span>
          <div className="flex items-center gap-2 shrink-0">
            <SignInButton mode="modal">
              <Button variant="primary" size="sm">Sign in to save</Button>
            </SignInButton>
            <button
              type="button"
              onClick={handleDismissDemoBanner}
              className="p-2 rounded-full text-amber-200/80 hover:text-amber-200 hover:bg-amber-500/20 transition-colors"
              aria-label="Dismiss banner"
            >
              <X size={18} />
            </button>
          </div>
        </div>
      )}
      {!clerkUser && showDismissedToast && (
        <div
          className="fixed top-4 left-4 right-4 z-40 overflow-hidden rounded-lg bg-gray-800 border border-gray-700 shadow-lg text-sm sm:left-auto sm:right-4 sm:max-w-sm"
          role="status"
          aria-live="polite"
        >
          <div className="flex items-center justify-between gap-3 px-4 py-3">
            <span className="text-gray-300">Banner dismissed.</span>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={handleDontShowDemoBannerAgain}
                className="text-amber-400 hover:text-amber-300 underline underline-offset-2 transition-colors"
              >
                Don&apos;t show again
              </button>
              <button
                type="button"
                onClick={handleDismissToast}
                className="p-1.5 rounded-full text-gray-400 hover:text-white hover:bg-gray-700 transition-colors"
                aria-label="Dismiss"
              >
                <X size={16} />
              </button>
            </div>
          </div>
          <div className="h-0.5 w-full bg-gray-700" aria-hidden="true">
            <div
              className="h-full bg-amber-500/70"
              style={{ animation: `toast-bar-shrink ${DISMISSED_TOAST_DURATION_SEC}s linear forwards` }}
            />
          </div>
        </div>
      )}
      {(guestMergePrompt === 'loading' || guestMergePrompt === 'open') && (
        <Modal
          isOpen
          onClose={handleGuestMergeCancel}
          title={guestMergePrompt === 'loading' ? 'Loading your account…' : 'You have on-device collection data'}
        >
          {guestMergePrompt === 'loading' ? (
            <div className="flex flex-col items-center gap-4 py-4">
              <Loader2 size={32} className="animate-spin text-gray-400" />
              <p className="text-sm text-gray-400 text-center">
                Loading your saved collection so you can choose how to combine it with your on-device data.
              </p>
              <Button variant="secondary" size="sm" onClick={handleGuestMergeCancel}>
                Cancel and stay in demo mode
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              <p className="text-sm text-gray-400">
                You signed in with collection data already on this device. Choose how to use it with your account:
              </p>
              <div className="space-y-3">
                <div className="rounded-lg border border-gray-700 bg-gray-800/50 p-4 space-y-2">
                  <Button variant="primary" fullWidth onClick={handleGuestMergeMerge} className="justify-center">
                    Merge into account
                  </Button>
                  <p className="text-xs text-gray-500">
                    Add on-device and cloud card counts together. On-device data will be deleted.
                  </p>
                </div>
                <div className="rounded-lg border border-gray-700 bg-gray-800/50 p-4 space-y-2">
                  <Button variant="secondary" fullWidth onClick={handleGuestMergeUseCloudOnly} className="justify-center">
                    Use cloud only
                  </Button>
                  <p className="text-xs text-gray-500">
                    Use cloud card counts only. On-device data will be saved.
                  </p>
                </div>
                <div className="rounded-lg border border-gray-700 bg-gray-800/50 p-4 space-y-2">
                  <Button variant="secondary" fullWidth onClick={handleGuestMergeCancel} className="justify-center border-gray-600">
                    Cancel
                  </Button>
                  <p className="text-xs text-gray-500">
                    Sign out and return to demo mode. On-device data will be saved.
                  </p>
                </div>
              </div>
            </div>
          )}
        </Modal>
      )}
      <div
        aria-hidden="true"
        className="absolute -left-[9999px] opacity-0 pointer-events-none text-sm whitespace-nowrap flex items-center gap-2"
        ref={(el) => { if (el && !measurerMountedOnceRef.current) { measurerMountedOnceRef.current = true; setMeasurerMounted(1); } }}
      >
        <span ref={collectionSetMeasureRef}>{LONGEST_SET_NAME}</span>
        <span ref={collectionSetIdMeasureRef} className="shrink-0 text-xs font-mono text-gray-400 bg-gray-800 px-2 py-0.5 rounded">{LONGEST_SET_ID}</span>
      </div>
      <div className="flex-1 min-h-0 overflow-hidden">
        <Routes>
          <Route path="/" element={renderDashboard()} />
          <Route path="/collection" element={renderCollection()} />
          <Route path="/collection/:slug" element={renderCollection()} />
          <Route path="/statistics" element={renderStats()} />
        </Routes>
      </div>
    </div>
  );
};

export default App;
