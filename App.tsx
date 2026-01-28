import React, { useState, useEffect, useCallback } from 'react';
import { View, CollectionState } from './types';
import { getCollection, saveCollection, updateCardCount } from './services/storage';
import { CARDS, SETS, getSetProgress } from './services/db';

import { Button } from './components/Button';
import { CardItem } from './components/CardItem';
import { 
  Library, 
  BarChart3, 
  ChevronLeft, 
  Filter, 
  Search
} from 'lucide-react';

const App: React.FC = () => {
  const [currentView, setCurrentView] = useState<View>(View.DASHBOARD);
  const [collection, setCollection] = useState<CollectionState>({});
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSetId, setSelectedSetId] = useState<string>('A1');
  const [filterOwned, setFilterOwned] = useState<'all' | 'owned' | 'missing'>('all');

  // Initialize data
  useEffect(() => {
    setCollection(getCollection());
  }, []);

  // Save collection whenever it changes
  useEffect(() => {
    if (Object.keys(collection).length > 0) {
      saveCollection(collection);
    }
  }, [collection]);

  // Handlers
  const handleUpdateCount = useCallback((cardId: string, delta: number) => {
    setCollection(prev => updateCardCount(prev, cardId, delta));
  }, []);

  // Views
  const renderDashboard = () => (
    <div className="flex flex-col h-full justify-center p-6 space-y-6 max-w-md mx-auto">
      <div className="text-center mb-4">
        <h1 className="text-4xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-purple-400">
          PocketDex
        </h1>
        <p className="text-gray-400 mt-2">TCG Pocket Companion</p>
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
    </div>
  );

  const renderCollection = () => {
    // Filtering logic
    const filteredCards = CARDS.filter(card => {
      const matchesSet = selectedSetId === 'ALL' || card.set === selectedSetId;
      const matchesSearch = card.name.toLowerCase().includes(searchQuery.toLowerCase()) || card.number.includes(searchQuery);
      const isOwned = (collection[card.id] || 0) > 0;
      
      if (filterOwned === 'owned' && !isOwned) return false;
      if (filterOwned === 'missing' && isOwned) return false;
      
      return matchesSet && matchesSearch;
    });

    return (
      <div className="flex flex-col h-full bg-black">
        {/* Header */}
        <div className="sticky top-0 z-30 bg-black/80 backdrop-blur-lg border-b border-gray-800 p-4 space-y-3">
          <div className="flex items-center gap-3">
            <button onClick={() => setCurrentView(View.DASHBOARD)} className="p-2 -ml-2 text-gray-400 hover:text-white">
              <ChevronLeft />
            </button>
            <h2 className="text-xl font-bold hidden xs:block">Collection</h2>
            
            {/* Set Selector */}
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
                placeholder="Search card..."
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

        {/* Grid */}
        <div className="flex-1 overflow-y-auto p-4 pb-24 touch-pan-y">
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
            {filteredCards.length === 0 && (
              <div className="col-span-full py-20 text-center text-gray-500 flex flex-col items-center">
                <p>No cards found.</p>
                <p className="text-sm mt-2">Try changing the Set filter or your search terms.</p>
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
