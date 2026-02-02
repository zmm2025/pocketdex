import React, { useState, useEffect } from 'react';
import { Card, Rarity } from '../types';
import { Minus, ImageOff } from 'lucide-react';

interface CardItemProps {
  card: Card;
  count: number;
  onIncrement: () => void;
  onDecrement: () => void;
}

export const CardItem: React.FC<CardItemProps> = ({
  card,
  count,
  onIncrement,
  onDecrement
}) => {
  const [imageError, setImageError] = useState(false);
  const isOwned = count > 0;

  // Reset error state if card changes (e.g. reused component in list)
  useEffect(() => {
    setImageError(false);
  }, [card.image]);

  // Visual cues for rarity
  const getRarityColor = (r: Rarity) => {
    if (r === Rarity.ILLUSTRATION_RARE || r === Rarity.CROWN_RARE) return 'border-yellow-400 shadow-yellow-900/40';
    if (r === Rarity.DOUBLE_RARE) return 'border-purple-400 shadow-purple-900/40';
    return 'border-gray-700 shadow-black/40';
  };

  const handleClick = (e: React.MouseEvent) => {
    if (e.ctrlKey) {
      e.preventDefault();
      onDecrement();
      return;
    }
    onIncrement();
  };

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    onDecrement();
  };

  return (
    <div 
      className="relative group flex flex-col items-center select-none touch-manipulation"
      data-card-id={card.id}
    >
      <div 
        onClick={handleClick}
        onContextMenu={handleContextMenu}
        className={`
          relative w-full aspect-[2.5/3.5] rounded-lg overflow-hidden border-2 transition-all duration-300
          ${getRarityColor(card.rarity)}
          ${isOwned ? 'opacity-100 shadow-xl' : 'opacity-40 grayscale'}
          active:scale-95 cursor-pointer bg-gray-800
        `}
      >
        {!imageError ? (
          <img
            src={card.image}
            alt={card.name}
            className="w-full h-full object-contain pointer-events-none" // Show full card; object-cover cropped landscape thumbnails in portrait slot
            loading="lazy"
            onError={() => setImageError(true)}
          />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center p-2 text-center text-gray-500 bg-gray-800">
            <ImageOff size={24} className="mb-2 opacity-50" />
            <span className="text-[10px] font-mono">{card.set}-{card.number}</span>
          </div>
        )}
        
        {/* Count Badge */}
        {count > 0 && (
          <div className="absolute top-1 right-1 bg-blue-600 text-white text-xs font-bold w-6 h-6 flex items-center justify-center rounded-full shadow-md z-10">
            {count}
          </div>
        )}

        {/* Rarity Indicator (Text Overlay) */}
        <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/80 to-transparent p-2 pt-6">
          <p className="text-[10px] text-gray-300 uppercase tracking-wider text-center font-bold truncate">
            {card.rarity === Rarity.DOUBLE_RARE ? 'RR' : card.rarity === Rarity.ILLUSTRATION_RARE ? 'IR' : ''}
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
             onClick={(e) => {
                e.stopPropagation();
                onDecrement();
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
