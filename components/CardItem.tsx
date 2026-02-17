import React, { useState, useEffect, useRef } from "react";
import { Card, Rarity } from "../types";
import { Minus, ImageOff } from "lucide-react";

const LONG_PRESS_MS = 500;

export type CardRect = {
  left: number;
  top: number;
  width: number;
  height: number;
};

interface CardItemProps {
  card: Card;
  count: number;
  onIncrement: (searchWasFocused?: boolean) => void;
  onDecrement: (searchWasFocused?: boolean) => void;
  onLongPress?: (rect: CardRect) => void;
  /** Ref to search input; when provided, used to detect if search was focused before tap */
  searchInputRef?: React.RefObject<HTMLInputElement | null>;
  /** When true, show number with set (e.g. "Genetic Apex #1"); when false, just "#1" */
  showSetInNumber?: boolean;
  /** Set name for the label when showSetInNumber is true (e.g. "Genetic Apex") */
  setName?: string;
  /** Optional explicit label under the card name; overrides set/number formatting. */
  numberLabelOverride?: string;
}

export const CardItem: React.FC<CardItemProps> = ({
  card,
  count,
  onIncrement,
  onDecrement,
  onLongPress,
  searchInputRef,
  showSetInNumber = false,
  setName,
  numberLabelOverride,
}) => {
  const numberLabel =
    numberLabelOverride ??
    (showSetInNumber
      ? `${setName ?? card.set} #${card.number}`
      : `#${card.number}`);
  const [imageError, setImageError] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);
  const isOwned = count > 0;
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const didLongPressRef = useRef(false);
  const searchWasFocusedRef = useRef(false);
  const cardFaceRef = useRef<HTMLDivElement>(null);

  const captureSearchFocusState = () => {
    searchWasFocusedRef.current = !!(
      searchInputRef?.current &&
      document.activeElement === searchInputRef.current
    );
  };

  // Reset error/loaded state if card changes (e.g. reused component in list)
  useEffect(() => {
    setImageError(false);
    setImageLoaded(false);
  }, [card.image]);

  // Visual cues for rarity
  const getRarityColor = (r: Rarity) => {
    if (r === Rarity.ILLUSTRATION_RARE || r === Rarity.CROWN_RARE)
      return "border-yellow-400 shadow-yellow-900/40";
    if (r === Rarity.DOUBLE_RARE)
      return "border-purple-400 shadow-purple-900/40";
    return "border-gray-700 shadow-black/40";
  };

  const clearLongPressTimer = () => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };

  const handlePointerDown = () => {
    captureSearchFocusState();
    if (onLongPress) {
      didLongPressRef.current = false;
      clearLongPressTimer();
      longPressTimerRef.current = setTimeout(() => {
        longPressTimerRef.current = null;
        didLongPressRef.current = true;
        const rect = cardFaceRef.current?.getBoundingClientRect();
        if (rect) {
          onLongPress({
            left: rect.left,
            top: rect.top,
            width: rect.width,
            height: rect.height,
          });
        } else {
          onLongPress({ left: 0, top: 0, width: 100, height: 140 });
        }
      }, LONG_PRESS_MS);
    }
  };

  const handlePointerUp = () => {
    clearLongPressTimer();
  };

  const handlePointerLeave = () => {
    clearLongPressTimer();
  };

  const handleClick = (e: React.MouseEvent) => {
    if (didLongPressRef.current) {
      e.preventDefault();
      e.stopPropagation();
      didLongPressRef.current = false;
      return;
    }
    if (e.ctrlKey) {
      e.preventDefault();
      onDecrement(searchWasFocusedRef.current);
      return;
    }
    onIncrement(searchWasFocusedRef.current);
  };

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    onDecrement(false);
  };

  return (
    <div
      className="relative group flex flex-col items-center select-none touch-manipulation"
      data-card-id={card.id}
    >
      <div
        ref={cardFaceRef}
        data-card-rect-id={card.id}
        onClick={handleClick}
        onContextMenu={handleContextMenu}
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerLeave}
        onPointerCancel={handlePointerUp}
        className={`
          relative w-full aspect-[2.5/3.5] rounded-lg overflow-hidden border-2 transition-all duration-300
          ${getRarityColor(card.rarity)}
          opacity-100
          ${isOwned ? "shadow-xl" : "grayscale"}
          active:scale-95 cursor-pointer bg-gray-800
        `}
      >
        {!imageError ? (
          <>
            {/* Centered placeholder until image loads */}
            {!imageLoaded && (
              <div className="absolute inset-0 flex items-center justify-center p-2 bg-gray-800">
                <span className="text-sm font-mono text-gray-500 text-center leading-tight">
                  {card.name}
                </span>
              </div>
            )}
            <img
              src={card.image}
              alt={card.name}
              className="w-full h-full object-contain pointer-events-none" // Show full card; object-cover cropped landscape thumbnails in portrait slot
              loading="lazy"
              onLoad={() => setImageLoaded(true)}
              onError={() => setImageError(true)}
            />
            {/* Darkening overlay for unowned cards (matches background; keeps card fully opaque for smooth inspect transition) */}
            {!isOwned && (
              <div
                className="absolute inset-0 bg-black/60 pointer-events-none"
                aria-hidden
              />
            )}
          </>
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center p-2 text-center text-gray-500 bg-gray-800">
            <ImageOff size={24} className="mb-2 opacity-50" />
            <span className="text-[10px] font-mono">{numberLabel}</span>
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
          <p className="text-xs font-medium text-gray-200 truncate">
            {card.name}
          </p>
          <p className="text-[10px] text-gray-500">{numberLabel}</p>
        </div>
        {isOwned && (
          <button
            onPointerDown={captureSearchFocusState}
            onClick={(e) => {
              e.stopPropagation();
              onDecrement(searchWasFocusedRef.current);
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
