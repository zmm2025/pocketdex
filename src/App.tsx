import React, { useState, useEffect, useRef, useCallback } from 'react';
import { View, CollectionState, GoogleUser } from './types';
import { getCollection, saveCollection, updateCardCount } from './services/storage';
import { CARDS, SETS, getSetProgress } from './services/db';
import { driveService } from './services/googleDriveService';

import { Button } from './components/Button';
import { CardItem } from './components/CardItem';
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
  LogOut
} from 'lucide-react';

const App: React.FC = () => {
  const [currentView, setCurrentView] = useState<View>(View.DASHBOARD);
  const [collection, setCollection] = useState<CollectionState>({});
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSetId, setSelectedSetId] = useState<string>('A1');
  const [filterOwned, setFilterOwned] = useState<'all' | 'owned' | 'missing'>('all');

  // Sync State
  const [user, setUser] = useState<GoogleUser | null>(null);
  const [syncStatus, setSyncStatus] = useState<'idle' | 'syncing' | 'saved' | 'error'>('idle');
  const [isDriveReady, setIsDriveReady] = useState(false);

  // Drag State
  const dragRef = useRef({
    active: false,
    mode: 'inc' as 'inc' | 'dec',
    visited: new Set<string>()
  });

  // Debounce ref for cloud save
  const saveTimeoutRef = useRef<NodeJS.Timeout>();

  // 1. Initialize App & Drive
  useEffect(() => {
    setCollection(getCollection());
    
    if (driveService.isConfigured()) {
      driveService.init(() => {
        setIsDriveReady(true);
      });
    }
  }, []);

  // 2. Auto-Save Logic (Local + Cloud)
  useEffect(() => {
    if (Object.keys(collection).length === 0) return;

    // Always save local immediately
    saveCollection(collection);

    // If logged in, debounce save to cloud
    if (user) {
      setSyncStatus('syncing');
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
      
      saveTimeoutRef.current = setTimeout(async () => {
        try {
          await driveService.saveData(collection);
          setSyncStatus('saved');
          setTimeout(() => setSyncStatus('idle'), 3000);
        } catch (e) {
          console.error(e);
          setSyncStatus('error');
        }
      }, 2000); // 2 second delay
    }
  }, [collection, user]);

  // Auth Handlers
  const handleGoogleLogin = async () => {
    if (!isDriveReady) return;
    try {
      const token = await driveService.login();
      setSyncStatus('syncing');
      
      const userInfo = await driveService.getUserInfo(token);
      setUser(userInfo);

      // Merge Logic: Download cloud data and merge with local
      // We take the MAX count of cards to ensure no data loss on either side
      const cloudData = await driveService.loadData();
      
      if (cloudData) {
        const localData = getCollection();
        const merged: CollectionState = { ...cloudData };
        
        Object.entries(localData).forEach(([id, count]) => {
          merged[id] = Math.max(merged[id] || 0, count as number);
        });

        setCollection(merged);
        saveCollection(merged); // Save merged back to local
        await driveService.saveData(merged); // Save merged back to cloud
      } else {
        // No cloud data yet, upload what we have
        await driveService.saveData(getCollection());
      }
      setSyncStatus('saved');
    } catch (e) {
      console.error("Login failed", e);
      setSyncStatus('error');
    }
  };

  const handleLogout = () => {
    setUser(null);
    setSyncStatus('idle');
    // Note: We don't clear local data on logout for this app type, 
    // keeping it "offline accessible".
  };

  // Card Handlers
  const handleUpdateCount = useCallback((cardId: string, delta: number) => {
    setCollection(prev => updateCardCount(prev, cardId, delta));
  }, []);

  const handleDragStart = (cardId: string, mode: 'inc' | 'dec', e: React.PointerEvent) => {
    dragRef.current = {
      active: true,
      mode,
      visited: new Set([cardId])
    };
    handleUpdateCount(cardId, mode === 'inc' ? 1 : -1);
    (e.target as Element).setPointerCapture(e.pointerId);
  };

  const handleDragMove = (e: React.PointerEvent) => {
    if (!dragRef.current.active) return;
    const target = document.elementFromPoint(e.clientX, e.clientY);
    const cardElement = target?.closest('[data-card-id]');
    
    if (cardElement) {
      const id = cardElement.getAttribute('data-card-id');
      if (id && !dragRef.current.visited.has(id)) {
        dragRef.current.visited.add(id);
        const delta = dragRef.current.mode === 'inc' ? 1 : -1;
        handleUpdateCount(id, delta);
      }
    }
  };

  const handleDragEnd = (e: React.PointerEvent) => {
    if (dragRef.current.active) {
      dragRef.current.active = false;
      dragRef.current.visited.clear();
      try { (e.target as Element).releasePointerCapture(e.pointerId); } catch (err) {}
    }
  };

  // --- Views ---

  const renderDashboard = () => (
    <div className="flex flex-col h-full justify-center p-6 space-y-6 max-w-md mx-auto relative">
      <div className="text-center mb-4">
        <h1 className="text-4xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-purple-400">
          PocketDex
        </h1>
        <p className="text-gray-400 mt-2">TCG Pocket Companion</p>
      </div>

      {/* Sync Status Card */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          {user ? (
             <img src={user.picture} alt="User" className="w-10 h-10 rounded-full border border-gray-700" />
          ) : (
            <div className="w-10 h-10 rounded-full bg-gray-800 flex items-center justify-center border border-gray-700">
              <Cloud size={20} className="text-gray-400" />
            </div>
          )}
          
          <div className="flex flex-col">
            <span className="text-sm font-bold text-gray-200">
              {user ? user.name : 'Cloud Sync'}
            </span>
            <span className="text-xs text-gray-500 flex items-center gap-1">
              {syncStatus === 'syncing' && <><Loader2 size={10} className="animate-spin"/> Syncing...</>}
              {syncStatus === 'saved' && <><CheckCircle2 size={10} className="text-green-500"/> Saved</>}
              {syncStatus === 'error' && <><AlertCircle size={10} className="text-red-500"/> Error</>}
              {syncStatus === 'idle' && (user ? 'Up to date' : 'Not connected')}
            </span>
          </div>
        </div>

        {user ? (
          <button 
            onClick={handleLogout}
            className="text-xs text-red-400 hover:text-red-300 px-3 py-1 bg-red-900/20 rounded-lg border border-red-900/50"
          >
            Logout
          </button>
        ) : (
          <Button 
            size="sm"
            onClick={handleGoogleLogin} 
            disabled={!isDriveReady}
            className="text-xs"
            title={!driveService.isConfigured() ? "Missing Client ID in .env" : ""}
          >
            {isDriveReady ? 'Connect Drive' : 'Loading...'}
          </Button>
        )}
      </div>

      <Button 
        variant="primary" 
        size="lg" 
        fullWidth 
        onClick={() => setCurrentView(View.COLLECTION)}
        className="h-24 flex flex-col items-center justify-center gap-1 group"
      >
        <Library className="group-hover:scale-110 transition-transform" />
        <span className="text-lg">My Collection</span>
      </Button>

      <Button 
        variant="secondary" 
        size="lg" 
        fullWidth 
        onClick={() => setCurrentView(View.STATS)}
        className="h-24 flex flex-col items-center justify-center gap-1 group bg-gray-800 border-gray-700"
      >
        <BarChart3 className="group-hover:scale-110 transition-transform text-green-400" />
        <span className="text-lg">Statistics</span>
      </Button>

      {!driveService.isConfigured() && (
        <p className="text-xs text-center text-red-500 mt-4">
          Development Note: VITE_GOOGLE_CLIENT_ID is missing in .env
        </p>
      )}
    </div>
  );

  const renderCollection = () => {
    // Filtering logic (same as before)
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
            <button onClick={() => setCurrentView(View.DASHBOARD)} className="p-2 -ml-2 text-gray-400 hover:text-white">
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
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-3 md:gap-4 select-none">
            {filteredCards.map(card => (
              <CardItem 
                key={card.id}
                card={card}
                count={collection[card.id] || 0}
                onIncrement={() => handleUpdateCount(card.id, 1)}
                onDecrement={() => handleUpdateCount(card.id, -1)}
                onDragStart={handleDragStart}
                onDragMove={handleDragMove}
                onDragEnd={handleDragEnd}
              />
            ))}
            {filteredCards.length === 0 && (
              <div className="col-span-full py-20 text-center text-gray-500 flex flex-col items-center">
                <p>No cards found.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  const renderStats = () => {
    return (
      <div className="flex flex-col h-full p-6 overflow-y-auto">
        <div className="flex items-center gap-3 mb-8">
           <button onClick={() => setCurrentView(View.DASHBOARD)} className="p-2 -ml-2 text-gray-400 hover:text-white">
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
  };

  return (
    <div className="min-h-screen bg-black text-white font-sans overflow-hidden">
      {currentView === View.DASHBOARD && renderDashboard()}
      {currentView === View.COLLECTION && renderCollection()}
      {currentView === View.STATS && renderStats()}
    </div>
  );
};

export default App;
