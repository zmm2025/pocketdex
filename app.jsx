import React, { useState, useEffect, useRef, useCallback } from "https://esm.sh/react@18.2.0";
import { createRoot } from "https://esm.sh/react-dom@18.2.0/client";
import {
  Library,
  BarChart3,
  ChevronLeft,
  Filter,
  Search,
  Minus,
  ImageOff
} from "https://esm.sh/lucide-react@0.563.0";

const Rarity = Object.freeze({
  COMMON: "Common",
  UNCOMMON: "Uncommon",
  RARE: "Rare",
  DOUBLE_RARE: "Double Rare",
  ART_RARE: "Art Rare",
  SUPER_RARE: "Super Rare",
  ILLUSTRATION_RARE: "Illustration Rare",
  CROWN_RARE: "Crown Rare"
});

const CardType = Object.freeze({
  POKEMON: "Pokemon",
  TRAINER: "Trainer",
  ITEM: "Item",
  SUPPORTER: "Supporter"
});

const View = Object.freeze({
  DASHBOARD: "DASHBOARD",
  COLLECTION: "COLLECTION",
  STATS: "STATS"
});

const ASSET_BASE = "assets";
const EXT = "jpg";

const getCardPath = (setId, number) => `${ASSET_BASE}/cards/${setId}/${number}.${EXT}`;
const getSetLogoPath = (setId) => `${ASSET_BASE}/sets/${setId}/logo.png`;
const getPackArtPath = (setId, variant) => `${ASSET_BASE}/sets/${setId}/pack_${variant}.jpg`;

const getRarityIconPath = (rarity) => {
  let filename = "diamond1";
  switch (rarity) {
    case Rarity.COMMON:
      filename = "diamond1";
      break;
    case Rarity.UNCOMMON:
      filename = "diamond2";
      break;
    case Rarity.RARE:
      filename = "diamond3";
      break;
    case Rarity.DOUBLE_RARE:
    case Rarity.ART_RARE:
      filename = "star1";
      break;
    case Rarity.SUPER_RARE:
      filename = "star2";
      break;
    case Rarity.ILLUSTRATION_RARE:
      filename = "star3";
      break;
    case Rarity.CROWN_RARE:
      filename = "crown";
      break;
  }
  return `${ASSET_BASE}/icons/rarity/${filename}.png`;
};

const getTypeIconPath = (type) => `${ASSET_BASE}/icons/types/${type.toLowerCase()}.png`;

const SETS = [
  { id: "A1", name: "Genetic Apex", totalCards: 286, coverImage: getSetLogoPath("A1") },
  { id: "A1a", name: "Mythical Island", totalCards: 86, coverImage: getSetLogoPath("A1a") },
  { id: "A2", name: "Space-Time Smackdown", totalCards: 207, coverImage: getSetLogoPath("A2") },
  { id: "A2a", name: "Triumphant Light", totalCards: 96, coverImage: getSetLogoPath("A2a") },
  { id: "A2b", name: "Shining Revelry", totalCards: 112, coverImage: getSetLogoPath("A2b") },
  { id: "A3", name: "Celestial Guardians", totalCards: 239, coverImage: getSetLogoPath("A3") },
  { id: "A3a", name: "Extradimensional Crisis", totalCards: 103, coverImage: getSetLogoPath("A3a") },
  { id: "A3b", name: "Eevee Grove", totalCards: 107, coverImage: getSetLogoPath("A3b") },
  { id: "A4", name: "Wisdom of Sea and Sky", totalCards: 241, coverImage: getSetLogoPath("A4") },
  { id: "A4a", name: "Secluded Springs", totalCards: 105, coverImage: getSetLogoPath("A4a") },
  { id: "A4b", name: "Deluxe Pack ex", totalCards: 379, coverImage: getSetLogoPath("A4b") },
  { id: "B1", name: "Mega Rising", totalCards: 331, coverImage: getSetLogoPath("B1") },
  { id: "B1a", name: "Crimson Blaze", totalCards: 103, coverImage: getSetLogoPath("B1a") },
  { id: "PROMO-A", name: "Promo-A", totalCards: 24, coverImage: getSetLogoPath("PROMO-A") },
  { id: "PROMO-B", name: "Promo-B", totalCards: 10, coverImage: getSetLogoPath("PROMO-B") }
];

const KNOWN_METADATA = {
  "A1-001": { name: "Bulbasaur", rarity: Rarity.COMMON, type: CardType.POKEMON, hp: 70 },
  "A1-002": { name: "Ivysaur", rarity: Rarity.UNCOMMON, type: CardType.POKEMON, hp: 100 },
  "A1-003": { name: "Venusaur ex", rarity: Rarity.DOUBLE_RARE, type: CardType.POKEMON, hp: 190 },
  "A1-004": { name: "Charmander", rarity: Rarity.COMMON, type: CardType.POKEMON, hp: 60 },
  "A1-005": { name: "Charmeleon", rarity: Rarity.UNCOMMON, type: CardType.POKEMON, hp: 90 },
  "A1-006": { name: "Charizard ex", rarity: Rarity.DOUBLE_RARE, type: CardType.POKEMON, hp: 180 },
  "A1-007": { name: "Squirtle", rarity: Rarity.COMMON, type: CardType.POKEMON, hp: 60 },
  "A1-008": { name: "Wartortle", rarity: Rarity.UNCOMMON, type: CardType.POKEMON, hp: 90 },
  "A1-009": { name: "Blastoise ex", rarity: Rarity.DOUBLE_RARE, type: CardType.POKEMON, hp: 180 },
  "A1-025": { name: "Pikachu ex", rarity: Rarity.DOUBLE_RARE, type: CardType.POKEMON, hp: 120 },
  "A1-096": { name: "Mewtwo ex", rarity: Rarity.DOUBLE_RARE, type: CardType.POKEMON, hp: 150 },
  "A1-150": { name: "Professor Oak", rarity: Rarity.UNCOMMON, type: CardType.SUPPORTER },
  "A1-151": { name: "Red Card", rarity: Rarity.COMMON, type: CardType.ITEM },
  "A1-152": { name: "X Speed", rarity: Rarity.COMMON, type: CardType.ITEM },
  "A1-220": { name: "Mewtwo (Immersive)", rarity: Rarity.ILLUSTRATION_RARE, type: CardType.POKEMON, hp: 150 },
  "A1-221": { name: "Charizard (Immersive)", rarity: Rarity.ILLUSTRATION_RARE, type: CardType.POKEMON, hp: 180 },
  "A1-222": { name: "Pikachu (Immersive)", rarity: Rarity.ILLUSTRATION_RARE, type: CardType.POKEMON, hp: 120 }
};

const CARDS = SETS.flatMap((set) => {
  return Array.from({ length: set.totalCards }, (_, i) => {
    const numInt = i + 1;
    const numStr = numInt.toString().padStart(3, "0");
    const id = `${set.id}-${numStr}`;
    const known = KNOWN_METADATA[id];

    return {
      id,
      set: set.id,
      number: numStr,
      image: getCardPath(set.id, numStr),
      name: (known && known.name) || `${set.name} #${numStr}`,
      rarity: (known && known.rarity) || Rarity.COMMON,
      type: (known && known.type) || CardType.POKEMON,
      hp: known && known.hp,
      ...known
    };
  });
});

const getSetProgress = (setId, collection) => {
  const setCards = CARDS.filter((card) => card.set === setId);
  const total = setCards.length;
  const owned = setCards.filter((card) => (collection[card.id] || 0) > 0).length;
  return {
    total,
    owned,
    percentage: total === 0 ? 0 : Math.round((owned / total) * 100)
  };
};

const STORAGE_KEY = "pocket_dex_collection_v1";

const getCollection = () => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? JSON.parse(stored) : {};
  } catch (error) {
    console.error("Failed to load collection", error);
    return {};
  }
};

const saveCollection = (collection) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(collection));
  } catch (error) {
    console.error("Failed to save collection", error);
  }
};

const updateCardCount = (collection, cardId, delta) => {
  const current = collection[cardId] || 0;
  const next = Math.max(0, current + delta);
  const newCollection = { ...collection, [cardId]: next };
  if (next === 0) {
    delete newCollection[cardId];
  }
  return newCollection;
};

const Button = ({
  children,
  variant = "primary",
  size = "md",
  fullWidth = false,
  className = "",
  ...props
}) => {
  const baseStyles =
    "inline-flex items-center justify-center rounded-xl font-semibold transition-all duration-200 active:scale-95 disabled:opacity-50 disabled:pointer-events-none";

  const variants = {
    primary: "bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-900/50",
    secondary: "bg-gray-700 hover:bg-gray-600 text-white border border-gray-600",
    danger: "bg-rose-600 hover:bg-rose-500 text-white shadow-lg shadow-rose-900/50",
    glass: "bg-white/10 hover:bg-white/20 text-white backdrop-blur-md border border-white/10"
  };

  const sizes = {
    sm: "px-3 py-1.5 text-sm",
    md: "px-4 py-3 text-base",
    lg: "px-6 py-4 text-lg"
  };

  return (
    <button
      className={`${baseStyles} ${variants[variant]} ${sizes[size]} ${fullWidth ? "w-full" : ""} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
};

const CardItem = ({
  card,
  count,
  onIncrement,
  onDecrement,
  onDragStart,
  onDragMove,
  onDragEnd,
  viewMode = "compact"
}) => {
  const [imageError, setImageError] = useState(false);
  const isOwned = count > 0;

  useEffect(() => {
    setImageError(false);
  }, [card.image]);

  const getRarityColor = (rarity) => {
    if (rarity === Rarity.ILLUSTRATION_RARE || rarity === Rarity.CROWN_RARE) {
      return "border-yellow-400 shadow-yellow-900/40";
    }
    if (rarity === Rarity.DOUBLE_RARE) return "border-purple-400 shadow-purple-900/40";
    return "border-gray-700 shadow-black/40";
  };

  const handlePointerDown = (event) => {
    let mode = "inc";

    if (event.button === 2 || event.ctrlKey) {
      mode = "dec";
    }

    onDragStart(card.id, mode, event);
  };

  return (
    <div
      className="relative group flex flex-col items-center select-none touch-manipulation"
      data-card-id={card.id}
    >
      <div
        onPointerDown={handlePointerDown}
        onPointerMove={onDragMove}
        onPointerUp={onDragEnd}
        onPointerCancel={onDragEnd}
        onContextMenu={(event) => event.preventDefault()}
        className={`
          relative w-full aspect-[2.5/3.5] rounded-lg overflow-hidden border-2 transition-all duration-300
          ${getRarityColor(card.rarity)}
          ${isOwned ? "opacity-100 shadow-xl" : "opacity-40 grayscale"}
          active:scale-95 cursor-pointer bg-gray-800
        `}
      >
        {!imageError ? (
          <img
            src={card.image}
            alt={card.name}
            className="w-full h-full object-cover pointer-events-none"
            loading="lazy"
            onError={() => setImageError(true)}
          />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center p-2 text-center text-gray-500 bg-gray-800">
            <ImageOff size={24} className="mb-2 opacity-50" />
            <span className="text-[10px] font-mono">
              {card.set}-{card.number}
            </span>
          </div>
        )}

        {count > 0 && (
          <div className="absolute top-1 right-1 bg-blue-600 text-white text-xs font-bold w-6 h-6 flex items-center justify-center rounded-full shadow-md z-10">
            {count}
          </div>
        )}

        <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/80 to-transparent p-2 pt-6">
          <p className="text-[10px] text-gray-300 uppercase tracking-wider text-center font-bold truncate">
            {card.rarity === Rarity.DOUBLE_RARE
              ? "RR"
              : card.rarity === Rarity.ILLUSTRATION_RARE
              ? "IR"
              : ""}
          </p>
        </div>
      </div>

      <div className="mt-2 w-full flex items-center justify-between px-1">
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium text-gray-200 truncate">{card.name}</p>
          <p className="text-[10px] text-gray-500">#{card.number}</p>
        </div>
        {isOwned && (
          <button
            onClick={(event) => {
              event.stopPropagation();
              onDecrement(event);
            }}
            className="ml-2 p-1 text-gray-400 hover:text-white hover:bg-white/10 rounded-full"
          >
            <Minus size={14} />
          </button>
        )}
      </div>
    </div>
  );
};

const App = () => {
  const [currentView, setCurrentView] = useState(View.DASHBOARD);
  const [collection, setCollection] = useState({});
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedSetId, setSelectedSetId] = useState("A1");
  const [filterOwned, setFilterOwned] = useState("all");

  const dragRef = useRef({
    active: false,
    mode: "inc",
    visited: new Set()
  });

  useEffect(() => {
    setCollection(getCollection());
  }, []);

  useEffect(() => {
    if (Object.keys(collection).length > 0) {
      saveCollection(collection);
    }
  }, [collection]);

  const handleUpdateCount = useCallback((cardId, delta) => {
    setCollection((prev) => updateCardCount(prev, cardId, delta));
  }, []);

  const handleDragStart = (cardId, mode, event) => {
    dragRef.current = {
      active: true,
      mode,
      visited: new Set([cardId])
    };
    handleUpdateCount(cardId, mode === "inc" ? 1 : -1);

    event.target.setPointerCapture(event.pointerId);
  };

  const handleDragMove = (event) => {
    if (!dragRef.current.active) return;

    const target = document.elementFromPoint(event.clientX, event.clientY);
    const cardElement = target ? target.closest("[data-card-id]") : null;

    if (cardElement) {
      const id = cardElement.getAttribute("data-card-id");
      if (id && !dragRef.current.visited.has(id)) {
        dragRef.current.visited.add(id);
        const delta = dragRef.current.mode === "inc" ? 1 : -1;
        handleUpdateCount(id, delta);
      }
    }
  };

  const handleDragEnd = (event) => {
    if (dragRef.current.active) {
      dragRef.current.active = false;
      dragRef.current.visited.clear();
      try {
        event.target.releasePointerCapture(event.pointerId);
      } catch (error) {
        // Ignore if pointer capture was already lost
      }
    }
  };

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
    const filteredCards = CARDS.filter((card) => {
      const matchesSet = selectedSetId === "ALL" || card.set === selectedSetId;
      const matchesSearch =
        card.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        card.number.includes(searchQuery);
      const isOwned = (collection[card.id] || 0) > 0;

      if (filterOwned === "owned" && !isOwned) return false;
      if (filterOwned === "missing" && isOwned) return false;

      return matchesSet && matchesSearch;
    });

    return (
      <div className="flex flex-col h-full bg-black">
        <div className="sticky top-0 z-30 bg-black/80 backdrop-blur-lg border-b border-gray-800 p-4 space-y-3">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setCurrentView(View.DASHBOARD)}
              className="p-2 -ml-2 text-gray-400 hover:text-white"
            >
              <ChevronLeft />
            </button>
            <h2 className="text-xl font-bold hidden xs:block">Collection</h2>

            <select
              value={selectedSetId}
              onChange={(event) => setSelectedSetId(event.target.value)}
              className="bg-gray-900 border border-gray-700 text-white text-sm rounded-lg p-2 flex-1 max-w-[200px] outline-none focus:border-blue-500 truncate"
            >
              {SETS.map((set) => (
                <option key={set.id} value={set.id}>
                  {set.name} ({set.id})
                </option>
              ))}
              <option value="ALL">All Sets</option>
            </select>

            <div className="ml-auto text-xs text-gray-500 font-mono whitespace-nowrap">
              {filteredCards.length} Cards
            </div>
          </div>

          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search
                className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500"
                size={16}
              />
              <input
                type="text"
                placeholder="Search card..."
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                className="w-full bg-gray-900 border border-gray-700 rounded-lg pl-9 pr-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500 transition-colors"
              />
            </div>
            <button
              className={`p-2 rounded-lg border ${
                filterOwned === "owned"
                  ? "bg-blue-600 border-blue-600 text-white"
                  : "bg-gray-800 border-gray-700 text-gray-400"
              }`}
              onClick={() => setFilterOwned((prev) => (prev === "owned" ? "all" : "owned"))}
              title="Show Owned Only"
            >
              <Filter size={18} />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 pb-24 touch-pan-y">
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-3 md:gap-4 select-none">
            {filteredCards.map((card) => (
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
                <p className="text-sm mt-2">Try changing the Set filter or your search terms.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  const renderStats = () => (
    <div className="flex flex-col h-full p-6 overflow-y-auto">
      <div className="flex items-center gap-3 mb-8">
        <button
          onClick={() => setCurrentView(View.DASHBOARD)}
          className="p-2 -ml-2 text-gray-400 hover:text-white"
        >
          <ChevronLeft />
        </button>
        <h2 className="text-2xl font-bold">Statistics</h2>
      </div>

      <div className="space-y-6 pb-12">
        {SETS.map((set) => {
          const stats = getSetProgress(set.id, collection);
          return (
            <div key={set.id} className="bg-gray-900 border border-gray-800 rounded-xl p-5 shadow-lg">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-bold text-white">{set.name}</h3>
                <span className="text-sm text-gray-400">
                  {stats.owned} / {stats.total}
                </span>
              </div>
              <div className="w-full bg-gray-800 rounded-full h-4 overflow-hidden">
                <div
                  className="bg-gradient-to-r from-blue-600 to-purple-500 h-full rounded-full transition-all duration-1000 ease-out"
                  style={{ width: `${stats.percentage}%` }}
                />
              </div>
              <div className="mt-2 text-right">
                <span className="text-sm font-medium text-blue-400">
                  {stats.percentage}% Complete
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-black text-white font-sans overflow-hidden">
      {currentView === View.DASHBOARD && renderDashboard()}
      {currentView === View.COLLECTION && renderCollection()}
      {currentView === View.STATS && renderStats()}
    </div>
  );
};

const rootElement = document.getElementById("root");
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = createRoot(rootElement);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
