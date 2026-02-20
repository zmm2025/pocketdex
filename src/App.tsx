import React, {
  useState,
  useEffect,
  useLayoutEffect,
  useRef,
  useCallback,
  useMemo,
} from "react";
import { Routes, Route, useNavigate, useLocation } from "react-router-dom";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  CardType,
  CollectionState,
  EnergyType,
  ExStatus,
  PokemonStage,
  Rarity,
} from "./types";
import {
  updateCardCount,
  getGuestCollection,
  setGuestCollection,
  clearGuestCollection,
} from "../services/storage";
import {
  CARDS,
  SETS,
  canonicalizeCollection,
  getCanonicalCardId,
  getSetProgress,
  getCollectionProgress,
  getSetSlug,
} from "../services/db";
import {
  loadCollection as loadCollectionFromApi,
  saveCollection as saveCollectionToApi,
} from "./services/collectionApi";
import { getNextHint, LOADING_HINT_RECENT_COUNT } from "./loadingHints";

import { Button } from "../components/Button";
import { CardItem, type CardRect } from "../components/CardItem";
import { Modal } from "../components/Modal";
import {
  type LucideIcon,
  Library,
  BarChart3,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Search,
  Filter,
  RotateCcw,
  Hash,
  Gem,
  Copy,
  Sun,
  AlertTriangle,
  Heart,
  Swords,
  Shield,
  Layers3,
  Zap,
  Package,
  ArrowUp,
  Cloud,
  CheckCircle2,
  AlertCircle,
  Loader2,
  X,
} from "lucide-react";
import {
  SignInButton,
  UserButton,
  useClerk,
  useSession,
  useUser,
} from "@clerk/clerk-react";
import boosterPackData from "../assets/data/booster-packs.json";

type AppCard = (typeof CARDS)[number];
type CollectionDisplayCard = {
  key: string;
  card: AppCard;
  count: number;
  numberLabel: string;
};

type TrainerSubtype =
  | "item"
  | "pokemon-tool"
  | "fossil"
  | "supporter"
  | "stadium";
type CopyBucket = "0" | "1" | "2plus";
type WeaknessFilterOption = EnergyType | "none";

type SortByOptionId =
  | "collector-number"
  | "rarity"
  | "count"
  | "type"
  | "weakness"
  | "hp"
  | "attack"
  | "retreat-cost"
  | "card-type"
  | "ability"
  | "expansion-order";

type SortDirection = "asc" | "desc";

type SortOption = {
  id: SortByOptionId;
  label: string;
  icon: LucideIcon;
};
type ActiveFilterChip = {
  key: string;
  content: React.ReactNode;
  onRemove: () => void;
};

const UI_ICON_BASE = `${(import.meta as any).env.BASE_URL || "/"}assets/ui/icons`;
const UI_TYPE_ICON_BASE = `${UI_ICON_BASE}/type`;
const UI_RARITY_ICON_BASE = `${UI_ICON_BASE}/rarity`;

const ENERGY_TYPE_OPTIONS: { value: EnergyType; icon: string }[] = [
  { value: "Grass", icon: `${UI_TYPE_ICON_BASE}/grass.png` },
  { value: "Fire", icon: `${UI_TYPE_ICON_BASE}/fire.png` },
  { value: "Water", icon: `${UI_TYPE_ICON_BASE}/water.png` },
  { value: "Lightning", icon: `${UI_TYPE_ICON_BASE}/lightning.png` },
  { value: "Psychic", icon: `${UI_TYPE_ICON_BASE}/psychic.png` },
  { value: "Fighting", icon: `${UI_TYPE_ICON_BASE}/fighting.png` },
  { value: "Darkness", icon: `${UI_TYPE_ICON_BASE}/darkness.png` },
  { value: "Metal", icon: `${UI_TYPE_ICON_BASE}/metal.png` },
  { value: "Dragon", icon: `${UI_TYPE_ICON_BASE}/dragon.png` },
  { value: "Colorless", icon: `${UI_TYPE_ICON_BASE}/colorless.png` },
];

const RARITY_OPTIONS: {
  value: Rarity;
  icon?: string;
  label?: string;
}[] = [
  { value: Rarity.COMMON, icon: `${UI_RARITY_ICON_BASE}/diamond1.png` },
  { value: Rarity.UNCOMMON, icon: `${UI_RARITY_ICON_BASE}/diamond2.png` },
  { value: Rarity.RARE, icon: `${UI_RARITY_ICON_BASE}/diamond3.png` },
  { value: Rarity.DOUBLE_RARE, icon: `${UI_RARITY_ICON_BASE}/diamond4.png` },
  { value: Rarity.ART_RARE, icon: `${UI_RARITY_ICON_BASE}/star1.png` },
  { value: Rarity.SUPER_RARE, icon: `${UI_RARITY_ICON_BASE}/star2.png` },
  { value: Rarity.ILLUSTRATION_RARE, icon: `${UI_RARITY_ICON_BASE}/star3.png` },
  { value: Rarity.SHINY_RARE, icon: `${UI_RARITY_ICON_BASE}/shiny1.png` },
  {
    value: Rarity.DOUBLE_SHINY_RARE,
    icon: `${UI_RARITY_ICON_BASE}/shiny2.png`,
  },
  { value: Rarity.CROWN_RARE, icon: `${UI_RARITY_ICON_BASE}/crown.png` },
  { value: Rarity.PROMO, label: "PROMO" },
];

const EX_STATUS_OPTIONS: { value: ExStatus; label: string }[] = [
  { value: "non-ex", label: "Normal" },
  { value: "ex", label: "Ex" },
  { value: "mega-ex", label: "Mega ex" },
];

const TRAINER_TYPE_OPTIONS: { value: TrainerSubtype; label: string }[] = [
  { value: "item", label: "Item" },
  { value: "pokemon-tool", label: "Tool" },
  { value: "fossil", label: "Fossil" },
  { value: "supporter", label: "Supporter" },
  { value: "stadium", label: "Stadium" },
];

const COPY_BUCKET_OPTIONS: { value: CopyBucket; label: string }[] = [
  { value: "0", label: "0 copies" },
  { value: "1", label: "1 copy" },
  { value: "2plus", label: "2+ copies" },
];

const POKEMON_STAGE_OPTIONS: PokemonStage[] = ["Basic", "Stage 1", "Stage 2"];

const SORT_OPTIONS: SortOption[] = [
  { id: "collector-number", label: "Collector card number", icon: Hash },
  { id: "rarity", label: "Rarity", icon: Gem },
  { id: "count", label: "Number of cards", icon: Copy },
  { id: "type", label: "Type", icon: Sun },
  { id: "weakness", label: "Weakness", icon: AlertTriangle },
  { id: "hp", label: "HP", icon: Heart },
  { id: "attack", label: "Attack", icon: Swords },
  { id: "retreat-cost", label: "Retreat Cost", icon: Shield },
  { id: "card-type", label: "Card Type", icon: Layers3 },
  { id: "ability", label: "Ability", icon: Zap },
  { id: "expansion-order", label: "Expansion order", icon: Package },
];

const SUPABASE_URL = (import.meta as any).env.VITE_SUPABASE_URL;
const COLLECTION_API_BASE = SUPABASE_URL
  ? `${SUPABASE_URL}/functions/v1`
  : null;

/** Background-matching overlay color for unowned card darkening (inspect transition); customizable later for theming */
const CARD_GRID_DARKEN_OVERLAY_COLOR = "rgb(0, 0, 0)";
const CARD_GRID_DARKEN_OVERLAY_OPACITY = 0.6;

const CLERK_PUBLISHABLE_KEY = (import.meta as any).env
  .VITE_CLERK_PUBLISHABLE_KEY as string | undefined;
const DEMO_BANNER_DONT_SHOW_KEY = "pocketdex_demo_banner_dont_show";
const DISMISSED_TOAST_DURATION_SEC = 5;
const isProductionKeyOnLocalhost =
  typeof window !== "undefined" &&
  window.location?.hostname === "localhost" &&
  typeof CLERK_PUBLISHABLE_KEY === "string" &&
  CLERK_PUBLISHABLE_KEY.startsWith("pk_live");

function getSyncErrorMessage(e: unknown): string {
  if (e == null) return "Something went wrong.";
  if (e instanceof Error) return e.message;
  if (typeof e === "object" && e !== null && "message" in e)
    return String((e as { message: unknown }).message);
  return "Something went wrong. Try again.";
}

function areCollectionsEqual(a: CollectionState, b: CollectionState): boolean {
  const aEntries = Object.entries(a).filter(([, count]) => count > 0);
  const bEntries = Object.entries(b).filter(([, count]) => count > 0);
  if (aEntries.length !== bEntries.length) return false;
  for (const [cardId, count] of aEntries) {
    if ((b[cardId] ?? 0) !== count) return false;
  }
  return true;
}

const parseMaybeNumber = (value: string): number | null => {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
};

const parseAttackDamageValue = (value: unknown): number | null => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const match = value.match(/\d+/);
    if (!match) return null;
    const parsed = Number(match[0]);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

const getCardAttackDamageMax = (card: AppCard): number | null => {
  const attacks = card.attacks ?? card.moves ?? [];
  const damages = attacks
    .map((attack) => parseAttackDamageValue((attack as any).damage))
    .filter((damage): damage is number => damage != null);
  if (damages.length === 0) return null;
  return Math.max(...damages);
};

const getCardCraftCost = (card: AppCard): number | null => {
  if (
    typeof card.costToCraft === "number" &&
    Number.isFinite(card.costToCraft)
  ) {
    return card.costToCraft;
  }
  switch (card.rarity) {
    case Rarity.COMMON:
      return 35;
    case Rarity.UNCOMMON:
      return 70;
    case Rarity.RARE:
      return 150;
    case Rarity.DOUBLE_RARE:
      return 500;
    case Rarity.ART_RARE:
    case Rarity.SHINY_RARE:
      return 400;
    case Rarity.SUPER_RARE:
    case Rarity.DOUBLE_SHINY_RARE:
      return 1250;
    case Rarity.ILLUSTRATION_RARE:
      return 1500;
    case Rarity.CROWN_RARE:
      return 2500;
    case Rarity.PROMO:
      return null;
    default:
      return null;
  }
};

const getRetreatCostCount = (card: AppCard): number | null => {
  if (!card.retreatCost || card.retreatCost.length === 0) return 0;
  return card.retreatCost.reduce((sum, cost) => sum + (cost.count ?? 0), 0);
};

const getNumericBounds = (
  values: readonly number[],
  fallbackMin: number,
  fallbackMax: number,
) => {
  if (values.length === 0) return { min: fallbackMin, max: fallbackMax };
  let min = values[0];
  let max = values[0];
  for (let i = 1; i < values.length; i += 1) {
    const value = values[i];
    if (value < min) min = value;
    if (value > max) max = value;
  }
  return { min, max };
};

const ENERGY_SORT_ORDER: EnergyType[] = [
  "Grass",
  "Fire",
  "Water",
  "Lightning",
  "Psychic",
  "Fighting",
  "Darkness",
  "Metal",
  "Dragon",
  "Colorless",
];

const getExpansionSortKey = (setId: string) => {
  const promoMatch = setId.match(/^PROMO-([A-Z])$/i);
  if (promoMatch) {
    return {
      block: promoMatch[1].toUpperCase(),
      number: 0,
      suffix: "",
      isPromo: true,
    };
  }
  const setMatch = setId.match(/^([A-Z])(\d+)([a-z])?$/);
  if (setMatch) {
    return {
      block: setMatch[1],
      number: Number(setMatch[2]),
      suffix: (setMatch[3] ?? "").toLowerCase(),
      isPromo: false,
    };
  }
  return {
    block: "A",
    number: 0,
    suffix: "",
    isPromo: false,
  };
};

const getTrainerSubtype = (card: AppCard): TrainerSubtype | null => {
  const text = `${card.name} ${card.description ?? ""}`.toLowerCase();
  if (card.type === CardType.SUPPORTER) return "supporter";
  if (card.type === CardType.POKEMON_TOOL) return "pokemon-tool";
  if (card.type === CardType.ITEM) {
    if (text.includes("fossil")) return "fossil";
    return "item";
  }
  if (text.includes("stadium")) return "stadium";
  return null;
};

type DualRangeFilterProps = {
  label: string;
  minBound: number;
  maxBound: number;
  step?: number;
  allowedValues?: number[];
  minValue: number;
  maxValue: number;
  onChange: (nextMin: number, nextMax: number) => void;
};

const DualRangeFilter: React.FC<DualRangeFilterProps> = ({
  label,
  minBound,
  maxBound,
  step = 1,
  allowedValues,
  minValue,
  maxValue,
  onChange,
}) => {
  const span = maxBound - minBound;
  const safeSpan = span <= 0 ? 1 : span;
  const hasRange = maxBound > minBound;
  const minPercent = ((minValue - minBound) / safeSpan) * 100;
  const maxPercent = ((maxValue - minBound) / safeSpan) * 100;
  const handlesOverlap = minValue === maxValue;
  const trackRef = useRef<HTMLDivElement>(null);

  const snappedValues = useMemo(() => {
    if (!allowedValues || allowedValues.length === 0) return null;
    const unique = Array.from(
      new Set(
        allowedValues.filter(
          (value) =>
            Number.isFinite(value) && value >= minBound && value <= maxBound,
        ),
      ),
    ).sort((a, b) => a - b);
    return unique.length > 0 ? unique : null;
  }, [allowedValues, minBound, maxBound]);

  const clampToStep = useCallback(
    (value: number) => {
      if (snappedValues && snappedValues.length > 0) {
        let nearest = snappedValues[0];
        let nearestDiff = Math.abs(value - nearest);
        for (let i = 1; i < snappedValues.length; i += 1) {
          const candidate = snappedValues[i];
          const diff = Math.abs(value - candidate);
          if (diff < nearestDiff) {
            nearest = candidate;
            nearestDiff = diff;
          }
        }
        return nearest;
      }
      const snapped = Math.round((value - minBound) / step) * step + minBound;
      return Math.max(minBound, Math.min(maxBound, snapped));
    },
    [minBound, maxBound, step, snappedValues],
  );

  const valueFromClientX = useCallback(
    (clientX: number) => {
      const rect = trackRef.current?.getBoundingClientRect();
      if (!rect || rect.width <= 0) return minBound;
      const ratio = Math.max(
        0,
        Math.min(1, (clientX - rect.left) / rect.width),
      );
      return clampToStep(minBound + ratio * (maxBound - minBound));
    },
    [clampToStep, minBound, maxBound],
  );

  const updateHandleValue = useCallback(
    (handle: "min" | "max", nextValue: number) => {
      if (handle === "min") {
        onChange(Math.min(nextValue, maxValue), maxValue);
        return;
      }
      onChange(minValue, Math.max(nextValue, minValue));
    },
    [onChange, minValue, maxValue],
  );

  const startDrag = useCallback(
    (handle: "min" | "max", e: React.PointerEvent<HTMLElement>) => {
      e.preventDefault();
      const pointerId = e.pointerId;
      const target = e.currentTarget;
      target.setPointerCapture?.(pointerId);

      const move = (clientX: number) => {
        updateHandleValue(handle, valueFromClientX(clientX));
      };

      const onPointerMove = (ev: PointerEvent) => move(ev.clientX);
      const onPointerUp = () => {
        window.removeEventListener("pointermove", onPointerMove);
        window.removeEventListener("pointerup", onPointerUp);
      };

      move(e.clientX);
      window.addEventListener("pointermove", onPointerMove);
      window.addEventListener("pointerup", onPointerUp);
    },
    [updateHandleValue, valueFromClientX],
  );

  const startDragOverlap = useCallback(
    (e: React.PointerEvent<HTMLElement>) => {
      e.preventDefault();
      const pointerId = e.pointerId;
      const target = e.currentTarget;
      target.setPointerCapture?.(pointerId);
      const startX = e.clientX;

      const onPointerMove = (ev: PointerEvent) => {
        const nextValue = valueFromClientX(ev.clientX);
        const delta = ev.clientX - startX;
        if (delta < 0) {
          updateHandleValue("min", nextValue);
          return;
        }
        updateHandleValue("max", nextValue);
      };

      const onPointerUp = () => {
        window.removeEventListener("pointermove", onPointerMove);
        window.removeEventListener("pointerup", onPointerUp);
      };

      window.addEventListener("pointermove", onPointerMove);
      window.addEventListener("pointerup", onPointerUp);
    },
    [valueFromClientX, updateHandleValue],
  );

  const onTrackPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!hasRange) return;
      const clickedValue = valueFromClientX(e.clientX);
      if (handlesOverlap) {
        const handle = clickedValue < minValue ? "min" : "max";
        updateHandleValue(handle, clickedValue);
        startDrag(handle, e);
        return;
      }
      const minDiff = Math.abs(clickedValue - minValue);
      const maxDiff = Math.abs(clickedValue - maxValue);
      const handle = minDiff <= maxDiff ? "min" : "max";
      updateHandleValue(handle, clickedValue);
      startDrag(handle, e);
    },
    [
      hasRange,
      valueFromClientX,
      minValue,
      maxValue,
      handlesOverlap,
      updateHandleValue,
      startDrag,
    ],
  );

  return (
    <div className="text-[11px] text-gray-400 space-y-1.5">
      <div className="flex items-center justify-between">
        <span>{label}</span>
        <span className="font-mono text-[10px] text-gray-300">
          {minValue} - {maxValue}
        </span>
      </div>
      <div
        ref={trackRef}
        className="relative h-7 px-3 touch-none"
        onPointerDown={onTrackPointerDown}
      >
        <div className="absolute left-3 right-3 top-1/2 h-1 -translate-y-1/2 rounded-full bg-gray-800" />
        <div
          className="absolute top-1/2 h-1 -translate-y-1/2 rounded-full bg-blue-600"
          style={{
            left: `${Math.max(0, Math.min(100, minPercent))}%`,
            right: `${Math.max(0, Math.min(100, 100 - maxPercent))}%`,
          }}
        />
        <button
          type="button"
          className="absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border border-blue-300 bg-blue-500 shadow outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          style={{
            left: `${Math.max(0, Math.min(100, minPercent))}%`,
          }}
          onPointerDown={(e) => {
            e.stopPropagation();
            if (handlesOverlap) {
              startDragOverlap(e);
              return;
            }
            startDrag("min", e);
          }}
          aria-label={`${label} minimum`}
          disabled={!hasRange}
        />
        {hasRange && !handlesOverlap && (
          <button
            type="button"
            className="absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border border-blue-300 bg-blue-500 shadow outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            style={{
              left: `${Math.max(0, Math.min(100, maxPercent))}%`,
            }}
            onPointerDown={(e) => {
              e.stopPropagation();
              startDrag("max", e);
            }}
            aria-label={`${label} maximum`}
          />
        )}
      </div>
    </div>
  );
};

type AppProps = { clerkEnabled?: boolean };

type GuestMergePromptState = "idle" | "loading" | "open";

const App: React.FC<AppProps> = ({ clerkEnabled = true }) => {
  const { session } = useSession();
  const { user: clerkUser, isLoaded: isUserLoaded } = useUser();
  const { signOut } = useClerk();
  const navigate = useNavigate();
  const location = useLocation();

  const [guestMergePrompt, setGuestMergePrompt] =
    useState<GuestMergePromptState>("idle");
  const [cloudDataForMerge, setCloudDataForMerge] =
    useState<CollectionState | null>(null);
  const [demoBannerDismissed, setDemoBannerDismissed] = useState(false);
  const [demoBannerDontShow, setDemoBannerDontShow] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem(DEMO_BANNER_DONT_SHOW_KEY) === "1";
  });
  const [showDismissedToast, setShowDismissedToast] = useState(false);
  const [toastExiting, setToastExiting] = useState(false);
  const [toastRevealed, setToastRevealed] = useState(false);
  const [demoBannerDismissing, setDemoBannerDismissing] = useState(false);

  // Update document title per route
  useEffect(() => {
    if (location.pathname === "/") {
      document.title = "PocketDex";
      return;
    }
    if (location.pathname === "/statistics") {
      document.title = "Statistics - PocketDex";
      return;
    }
    if (location.pathname === "/collection") {
      document.title = "Collection - PocketDex";
      return;
    }
    document.title = "PocketDex";
  }, [location.pathname]);

  const [collection, setCollection] = useState<CollectionState>({});
  const [searchQuery, setSearchQuery] = useState("");
  const [collectionSearchOpen, setCollectionSearchOpen] = useState(false);
  const [collectionFiltersOpen, setCollectionFiltersOpen] = useState(false);
  const [collectionSetDropdownOpen, setCollectionSetDropdownOpen] =
    useState(false);
  const [collectionBoosterDropdownOpen, setCollectionBoosterDropdownOpen] =
    useState(false);
  const [collectionSortDropdownOpen, setCollectionSortDropdownOpen] =
    useState(false);
  const [sortBy, setSortBy] = useState<SortByOptionId>("collector-number");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");
  const [selectedSetFilters, setSelectedSetFilters] = useState<string[]>([]);
  const [selectedBoosterPackFilters, setSelectedBoosterPackFilters] = useState<
    string[]
  >([]);
  const [selectedRarities, setSelectedRarities] = useState<Rarity[]>([]);
  const [selectedPokemonTypes, setSelectedPokemonTypes] = useState<
    EnergyType[]
  >([]);
  const [hpMinInput, setHpMinInput] = useState("ANY");
  const [hpMaxInput, setHpMaxInput] = useState("ANY");
  const [attackMinInput, setAttackMinInput] = useState("ANY");
  const [attackMaxInput, setAttackMaxInput] = useState("ANY");
  const [craftCostMinInput, setCraftCostMinInput] = useState("ANY");
  const [craftCostMaxInput, setCraftCostMaxInput] = useState("ANY");
  const [selectedWeaknessFilters, setSelectedWeaknessFilters] = useState<
    WeaknessFilterOption[]
  >([]);
  const [retreatMinInput, setRetreatMinInput] = useState("");
  const [retreatMaxInput, setRetreatMaxInput] = useState("");
  const [abilityFilter, setAbilityFilter] = useState<"has" | "none" | null>(
    null,
  );
  const [selectedCopyBuckets, setSelectedCopyBuckets] = useState<CopyBucket[]>(
    [],
  );
  const [selectedPokemonStages, setSelectedPokemonStages] = useState<
    PokemonStage[]
  >([]);
  const [selectedExStatuses, setSelectedExStatuses] = useState<ExStatus[]>([]);
  const [selectedTrainerTypes, setSelectedTrainerTypes] = useState<
    TrainerSubtype[]
  >([]);
  const [searchResultsRevealed, setSearchResultsRevealed] = useState(true);
  const prevSearchQueryRef = useRef<string | null>(null);
  const selectableSetIds = useMemo(
    () => ["ALL", ...SETS.map((set) => set.id)],
    [],
  );
  const selectedSetId =
    selectedSetFilters.length === 1 ? selectedSetFilters[0] : "ALL";

  const [lastCollectionSetId, setLastCollectionSetId] = useState<string | null>(
    null,
  );
  const [statsFlashTargetId, setStatsFlashTargetId] = useState<string | null>(
    null,
  );
  const [loadingHint, setLoadingHint] = useState(() => getNextHint([]));
  const loadingHintRecentRef = useRef<string[]>([]);
  useEffect(() => {
    if (location.pathname !== "/collection") return;
    if (selectedSetFilters.length === 1) {
      setLastCollectionSetId(selectedSetFilters[0]);
    }
  }, [location.pathname, selectedSetFilters]);

  const collectionSearchPanelRef = useRef<HTMLDivElement>(null);
  const collectionFilterToggleRef = useRef<HTMLButtonElement>(null);
  const collectionSearchToggleRef = useRef<HTMLButtonElement>(null);
  const collectionSearchBarRef = useRef<HTMLDivElement>(null);
  const collectionSearchInputRef = useRef<HTMLInputElement>(null);
  const collectionSetDropdownRef = useRef<HTMLDivElement>(null);
  const collectionBoosterDropdownRef = useRef<HTMLDivElement>(null);
  const collectionSortDropdownRef = useRef<HTMLDivElement>(null);
  const collectionScrollRef = useRef<HTMLDivElement>(null);
  const collectionCardsAreaRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!location.pathname.startsWith("/collection/")) return;
    navigate("/collection", { replace: true });
  }, [location.pathname, navigate]);

  useEffect(() => {
    if (!location.pathname.startsWith("/collection")) return;
    collectionScrollRef.current?.scrollTo(0, 0);
  }, [selectedSetFilters, selectedBoosterPackFilters]);

  // Search results: set revealed false before paint when search changes, then reveal after rAF so transition runs (skip on first load)
  useLayoutEffect(() => {
    if (!location.pathname.startsWith("/collection")) return;
    const prev = prevSearchQueryRef.current;
    prevSearchQueryRef.current = searchQuery;
    if (prev === null) return; // first load: no transition
    if (prev === searchQuery) return;
    setSearchResultsRevealed(false);
    const id = requestAnimationFrame(() => {
      requestAnimationFrame(() => setSearchResultsRevealed(true));
    });
    return () => cancelAnimationFrame(id);
  }, [searchQuery, location.pathname]);

  // Scroll Statistics to the set card when navigating with hash; position so bottom of set above is at top (with padding). Flash target card after scroll completes.
  useEffect(() => {
    if (location.pathname !== "/statistics" || !location.hash) return;
    const id = location.hash.slice(1);
    const target = id ? document.getElementById(id) : null;
    if (!target) return;

    const scrollPadding = 24;

    const runScroll = (scrollContainer: Element) => {
      const prev = target.previousElementSibling;
      const containerRect = scrollContainer.getBoundingClientRect();
      // Treat top of view as below the sticky header so the target isn't hidden (Statistics panel has sticky header as first child)
      const headerEl = scrollContainer.firstElementChild;
      const headerHeight = headerEl
        ? headerEl.getBoundingClientRect().height
        : 0;
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
      const maxScroll =
        scrollContainer.scrollHeight - scrollContainer.clientHeight;
      const newScrollTop = Math.max(
        0,
        Math.min(maxScroll, scrollTopBefore + delta),
      );
      scrollContainer.scrollTo({ top: newScrollTop, behavior: "smooth" });
    };

    let scrollContainer: Element | null = target.parentElement;
    while (scrollContainer && scrollContainer !== document.body) {
      const overflowY = getComputedStyle(scrollContainer).overflowY;
      if (
        overflowY === "auto" ||
        overflowY === "scroll" ||
        overflowY === "overlay"
      )
        break;
      scrollContainer = scrollContainer.parentElement;
    }
    if (!scrollContainer) return;

    const startFlashMs = 550;
    const flashDurationMs = 550;
    const startFlash = setTimeout(
      () => setStatsFlashTargetId(id),
      startFlashMs,
    );
    const clearFlash = setTimeout(
      () => setStatsFlashTargetId(null),
      startFlashMs + flashDurationMs,
    );

    const doScrollWhenReady = () => {
      const maxScroll =
        scrollContainer!.scrollHeight - scrollContainer!.clientHeight;
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
          window.scrollTo({
            top: window.scrollY + prevRect.bottom - scrollPadding,
            behavior: "smooth",
          });
        } else {
          target.scrollIntoView({ behavior: "smooth", block: "start" });
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

  // Column count for collection grid (matches Tailwind: 3 < sm, 4 sm–md, 6 md+)
  const getDefaultCollectionColumnCount = (width: number) =>
    width < 900 ? 3 : 5;
  const ALLOWED_COLLECTION_COLUMN_COUNTS = useMemo(() => {
    const values: number[] = [];
    for (let i = 3; i <= 60; i += 1) {
      if (i % 3 === 0 || i % 5 === 0) values.push(i);
    }
    return values;
  }, []);
  const [collectionColumnCount, setCollectionColumnCount] = useState(() =>
    typeof window !== "undefined"
      ? getDefaultCollectionColumnCount(window.innerWidth)
      : 3,
  );
  const [collectionColumnZoomCustomized, setCollectionColumnZoomCustomized] =
    useState(false);
  useEffect(() => {
    const onResize = () =>
      setCollectionColumnCount((prev) =>
        collectionColumnZoomCustomized
          ? prev
          : getDefaultCollectionColumnCount(window.innerWidth),
      );
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [collectionColumnZoomCustomized]);
  const adjustCollectionColumnCount = useCallback(
    (direction: "in" | "out") => {
      setCollectionColumnCount((prev) => {
        if (direction === "in") {
          const nextIn = [...ALLOWED_COLLECTION_COLUMN_COUNTS]
            .reverse()
            .find((value) => value < prev);
          return nextIn ?? prev;
        }
        const nextOut = ALLOWED_COLLECTION_COLUMN_COUNTS.find(
          (value) => value > prev,
        );
        return nextOut ?? prev;
      });
      setCollectionColumnZoomCustomized(true);
    },
    [ALLOWED_COLLECTION_COLUMN_COUNTS],
  );
  useEffect(() => {
    const el = collectionCardsAreaRef.current;
    if (!el) return;
    const onWheel = (event: WheelEvent) => {
      if (!event.ctrlKey) return;
      event.preventDefault();
      adjustCollectionColumnCount(event.deltaY < 0 ? "in" : "out");
    };
    let lastPinchDistance: number | null = null;
    const PINCH_THRESHOLD_PX = 10;
    const onTouchMove = (event: TouchEvent) => {
      if (event.touches.length !== 2) {
        lastPinchDistance = null;
        return;
      }
      const dx = event.touches[0].clientX - event.touches[1].clientX;
      const dy = event.touches[0].clientY - event.touches[1].clientY;
      const distance = Math.hypot(dx, dy);
      if (lastPinchDistance == null) {
        lastPinchDistance = distance;
        return;
      }
      const delta = distance - lastPinchDistance;
      if (Math.abs(delta) < PINCH_THRESHOLD_PX) return;
      event.preventDefault();
      adjustCollectionColumnCount(delta > 0 ? "out" : "in");
      lastPinchDistance = distance;
    };
    const clearPinch = () => {
      lastPinchDistance = null;
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    el.addEventListener("touchmove", onTouchMove, { passive: false });
    el.addEventListener("touchend", clearPinch);
    el.addEventListener("touchcancel", clearPinch);
    return () => {
      el.removeEventListener("wheel", onWheel);
      el.removeEventListener("touchmove", onTouchMove);
      el.removeEventListener("touchend", clearPinch);
      el.removeEventListener("touchcancel", clearPinch);
    };
  }, [adjustCollectionColumnCount]);

  const isCollectionRoute = location.pathname.startsWith("/collection");
  const setOrderById = useMemo(
    () => Object.fromEntries(SETS.map((set, index) => [set.id, index])),
    [],
  );
  const hpMin = parseMaybeNumber(hpMinInput);
  const hpMax = parseMaybeNumber(hpMaxInput);
  const attackMin = parseMaybeNumber(attackMinInput);
  const attackMax = parseMaybeNumber(attackMaxInput);
  const craftCostMin = parseMaybeNumber(craftCostMinInput);
  const craftCostMax = parseMaybeNumber(craftCostMaxInput);
  const retreatMin = parseMaybeNumber(retreatMinInput);
  const retreatMax = parseMaybeNumber(retreatMaxInput);
  const hpBounds = useMemo(() => {
    const hpValues = CARDS.map((card) => card.hp ?? card.health).filter(
      (value): value is number =>
        typeof value === "number" && Number.isFinite(value),
    );
    return getNumericBounds(hpValues, 0, 0);
  }, []);
  const attackBounds = useMemo(() => {
    const attackValues = CARDS.map((card) =>
      getCardAttackDamageMax(card),
    ).filter(
      (value): value is number =>
        typeof value === "number" && Number.isFinite(value),
    );
    return getNumericBounds(attackValues, 0, 300);
  }, []);
  const retreatBounds = useMemo(() => {
    const retreatValues = CARDS.map((card) => getRetreatCostCount(card)).filter(
      (value): value is number =>
        typeof value === "number" && Number.isFinite(value),
    );
    return getNumericBounds(retreatValues, 0, 0);
  }, []);
  const craftCostBounds = useMemo(() => {
    const craftCostValues = CARDS.map((card) => getCardCraftCost(card)).filter(
      (value): value is number =>
        typeof value === "number" && Number.isFinite(value),
    );
    return getNumericBounds(craftCostValues, 0, 0);
  }, []);
  const craftCostStops = useMemo(
    () =>
      Array.from(
        new Set(
          CARDS.map((card) => getCardCraftCost(card)).filter(
            (value): value is number =>
              typeof value === "number" && Number.isFinite(value),
          ),
        ),
      ).sort((a, b) => a - b),
    [],
  );
  const clampToBounds = (value: number, min: number, max: number) =>
    Math.max(min, Math.min(max, value));
  const hpMinSliderValue = clampToBounds(
    hpMin ?? hpBounds.min,
    hpBounds.min,
    hpBounds.max,
  );
  const hpMaxSliderValue = clampToBounds(
    hpMax ?? hpBounds.max,
    hpBounds.min,
    hpBounds.max,
  );
  const attackMinSliderValue = clampToBounds(
    attackMin ?? attackBounds.min,
    attackBounds.min,
    attackBounds.max,
  );
  const attackMaxSliderValue = clampToBounds(
    attackMax ?? attackBounds.max,
    attackBounds.min,
    attackBounds.max,
  );
  const craftCostMinSliderValue = clampToBounds(
    craftCostMin ?? craftCostBounds.min,
    craftCostBounds.min,
    craftCostBounds.max,
  );
  const craftCostMaxSliderValue = clampToBounds(
    craftCostMax ?? craftCostBounds.max,
    craftCostBounds.min,
    craftCostBounds.max,
  );
  const retreatMinSliderValue = clampToBounds(
    retreatMin ?? retreatBounds.min,
    retreatBounds.min,
    retreatBounds.max,
  );
  const retreatMaxSliderValue = clampToBounds(
    retreatMax ?? retreatBounds.max,
    retreatBounds.min,
    retreatBounds.max,
  );
  const boosterPackOptions = useMemo<{ id: string; name: string }[]>(() => {
    const setPackMap = (boosterPackData as any).setPacks ?? {};
    const sourceSetIds =
      selectedSetFilters.length > 0 ? selectedSetFilters : selectableSetIds;
    const showSetPrefix = selectedSetFilters.length > 1;
    const unique = new Map<string, { id: string; name: string }>();
    for (const setId of sourceSetIds) {
      if (setId === "ALL") continue;
      const setName = SETS.find((set) => set.id === setId)?.name ?? setId;
      const packsForSet = (setPackMap[setId] ?? []) as {
        id: string;
        name?: string;
      }[];
      for (const pack of packsForSet) {
        if (!unique.has(pack.id)) {
          const packName = pack.name ?? pack.id;
          unique.set(pack.id, {
            id: pack.id,
            name: showSetPrefix ? `${setName}: ${packName}` : packName,
          });
        }
      }
    }
    return Array.from(unique.values()).sort((a, b) =>
      a.name.localeCompare(b.name),
    );
  }, [selectedSetFilters, selectableSetIds]);

  useEffect(() => {
    setSelectedBoosterPackFilters((prev) =>
      prev.filter((value) =>
        boosterPackOptions.some((option) => option.id === value),
      ),
    );
  }, [boosterPackOptions]);

  useEffect(() => {
    if (selectedSetFilters.length === 0 || boosterPackOptions.length <= 1) {
      setCollectionBoosterDropdownOpen(false);
    }
  }, [selectedSetFilters, boosterPackOptions.length]);

  const collectionFilteredCards = useMemo<CollectionDisplayCard[]>(() => {
    if (!isCollectionRoute) return [];
    const normalizedSearch = searchQuery.toLowerCase();
    const display: CollectionDisplayCard[] = [];
    for (const card of CARDS) {
      const printings =
        card.printings && card.printings.length > 0
          ? [...card.printings].sort((a, b) => {
              const setDiff =
                (setOrderById[a.set] ?? 9999) - (setOrderById[b.set] ?? 9999);
              if (setDiff !== 0) return setDiff;
              return a.number - b.number;
            })
          : [{ set: card.set, number: card.number }];
      const inSelectedSet =
        selectedSetFilters.length === 0 ||
        printings.some((printing) => selectedSetFilters.includes(printing.set));
      if (!inSelectedSet) continue;
      const mappedBoosterPacks =
        ((boosterPackData as any).cardPacks?.[card.id] as
          | string[]
          | undefined) ??
        card.boosterPacks ??
        [];
      if (
        selectedBoosterPackFilters.length > 0 &&
        !selectedBoosterPackFilters.some((pack) =>
          mappedBoosterPacks.includes(pack),
        )
      ) {
        continue;
      }
      if (
        selectedRarities.length > 0 &&
        !selectedRarities.includes(card.rarity)
      )
        continue;
      const pokemonType = card.pokemonType ?? card.energyType;
      if (
        selectedPokemonTypes.length > 0 &&
        (!pokemonType || !selectedPokemonTypes.includes(pokemonType))
      ) {
        continue;
      }
      const hpValue = card.hp ?? card.health ?? null;
      if (hpMin != null && (hpValue == null || hpValue < hpMin)) continue;
      if (hpMax != null && (hpValue == null || hpValue > hpMax)) continue;
      const maxAttackDamage = getCardAttackDamageMax(card);
      if (
        attackMin != null &&
        (maxAttackDamage == null || maxAttackDamage < attackMin)
      ) {
        continue;
      }
      if (
        attackMax != null &&
        (maxAttackDamage == null || maxAttackDamage > attackMax)
      ) {
        continue;
      }
      const craftCost = getCardCraftCost(card);
      if (
        craftCostMin != null &&
        (craftCost == null || craftCost < craftCostMin)
      )
        continue;
      if (
        craftCostMax != null &&
        (craftCost == null || craftCost > craftCostMax)
      )
        continue;
      if (selectedWeaknessFilters.length > 0) {
        const hasNoneWeakness = !card.weakness;
        const matchesNone =
          selectedWeaknessFilters.includes("none") && hasNoneWeakness;
        const matchesTyped =
          card.weakness != null &&
          selectedWeaknessFilters.includes(card.weakness.type);
        if (!matchesNone && !matchesTyped) continue;
      }
      const retreatCount = getRetreatCostCount(card);
      if (
        retreatMin != null &&
        (retreatCount == null || retreatCount < retreatMin)
      )
        continue;
      if (
        retreatMax != null &&
        (retreatCount == null || retreatCount > retreatMax)
      )
        continue;
      const hasAbility = (card.abilities ?? []).length > 0;
      if (abilityFilter === "has" && !hasAbility) continue;
      if (abilityFilter === "none" && hasAbility) continue;
      if (
        selectedExStatuses.length > 0 &&
        !selectedExStatuses.includes(card.exStatus ?? "non-ex")
      ) {
        continue;
      }
      if (selectedTrainerTypes.length > 0) {
        const trainerSubtype = getTrainerSubtype(card);
        if (!trainerSubtype || !selectedTrainerTypes.includes(trainerSubtype))
          continue;
      }
      const pokemonStage = (card.pokemonStage ??
        card.stage ??
        null) as PokemonStage | null;
      if (
        selectedPokemonStages.length > 0 &&
        (!pokemonStage || !selectedPokemonStages.includes(pokemonStage))
      ) {
        continue;
      }
      const count = collection[card.id] || 0;
      if (selectedCopyBuckets.length > 0) {
        const matchesCopies =
          (selectedCopyBuckets.includes("0") && count === 0) ||
          (selectedCopyBuckets.includes("1") && count === 1) ||
          (selectedCopyBuckets.includes("2plus") && count >= 2);
        if (!matchesCopies) continue;
      }
      const matchesSearch =
        card.name.toLowerCase().includes(normalizedSearch) ||
        String(card.number).includes(searchQuery) ||
        printings.some((printing) =>
          String(printing.number).includes(searchQuery),
        );
      if (!matchesSearch) continue;
      const numberLabel =
        selectedSetId === "ALL"
          ? printings
              .map(
                (printing) =>
                  `${SETS.find((s) => s.id === printing.set)?.name ?? printing.set} #${printing.number}`,
              )
              .join(", ")
          : (() => {
              const printingForSet =
                printings.find((printing) => printing.set === selectedSetId) ??
                printings[0];
              return `#${printingForSet.number}`;
            })();

      const item = {
        key: card.id,
        card,
        count,
        numberLabel,
      };
      display.push(item);
    }

    const compareCollectorNumber = (
      a: CollectionDisplayCard,
      b: CollectionDisplayCard,
    ) => {
      const setDiff =
        (setOrderById[a.card.set] ?? 9999) - (setOrderById[b.card.set] ?? 9999);
      if (setDiff !== 0) return setDiff;
      return a.card.number - b.card.number;
    };

    const compareNullableNumber = (
      a: number | null,
      b: number | null,
      highToLow: boolean,
      naAlwaysLast: boolean,
    ) => {
      if (a == null && b == null) return 0;
      if (a == null) return naAlwaysLast ? 1 : -1;
      if (b == null) return naAlwaysLast ? -1 : 1;
      return highToLow ? b - a : a - b;
    };

    const getEnergyRank = (type: EnergyType | null) => {
      if (!type) return Number.POSITIVE_INFINITY;
      const idx = ENERGY_SORT_ORDER.indexOf(type);
      return idx === -1 ? Number.POSITIVE_INFINITY : idx;
    };

    const getRarityRankAsc = (rarity: Rarity) => {
      const order: Rarity[] = [
        Rarity.CROWN_RARE,
        Rarity.DOUBLE_SHINY_RARE,
        Rarity.SHINY_RARE,
        Rarity.ILLUSTRATION_RARE,
        Rarity.SUPER_RARE,
        Rarity.ART_RARE,
        Rarity.DOUBLE_RARE,
        Rarity.RARE,
        Rarity.UNCOMMON,
        Rarity.COMMON,
      ];
      const idx = order.indexOf(rarity);
      return idx === -1 ? 999 : idx;
    };

    const getCardTypeRankAsc = (card: AppCard) => {
      if (card.type !== CardType.POKEMON) return 3;
      if (card.exStatus === "mega-ex") return 2;
      if (card.exStatus === "ex") return 1;
      return 0;
    };

    const getAbilityRankAsc = (card: AppCard) => {
      if (card.type !== CardType.POKEMON) return 2;
      return (card.abilities ?? []).length > 0 ? 0 : 1;
    };

    const compareExpansionOrder = (
      a: CollectionDisplayCard,
      b: CollectionDisplayCard,
      direction: SortDirection,
    ) => {
      const aKey = getExpansionSortKey(a.card.set);
      const bKey = getExpansionSortKey(b.card.set);
      if (aKey.block !== bKey.block) {
        return direction === "asc"
          ? bKey.block.localeCompare(aKey.block)
          : aKey.block.localeCompare(bKey.block);
      }
      if (aKey.isPromo !== bKey.isPromo) {
        return aKey.isPromo ? 1 : -1;
      }
      if (aKey.number !== bKey.number) {
        return direction === "asc"
          ? bKey.number - aKey.number
          : aKey.number - bKey.number;
      }
      const aSuffixWeight =
        aKey.suffix.length > 0 ? aKey.suffix.charCodeAt(0) - 96 : 0;
      const bSuffixWeight =
        bKey.suffix.length > 0 ? bKey.suffix.charCodeAt(0) - 96 : 0;
      return direction === "asc"
        ? bSuffixWeight - aSuffixWeight
        : aSuffixWeight - bSuffixWeight;
    };

    return display.sort((a, b) => {
      let diff = 0;
      switch (sortBy) {
        case "collector-number":
          diff = compareCollectorNumber(a, b);
          break;
        case "rarity": {
          const aPromo = a.card.rarity === Rarity.PROMO;
          const bPromo = b.card.rarity === Rarity.PROMO;
          if (aPromo !== bPromo) diff = aPromo ? 1 : -1;
          else {
            const base =
              getRarityRankAsc(a.card.rarity) - getRarityRankAsc(b.card.rarity);
            diff = sortDirection === "asc" ? base : -base;
          }
          break;
        }
        case "count":
          diff =
            sortDirection === "asc" ? b.count - a.count : a.count - b.count;
          break;
        case "type": {
          const aType = a.card.pokemonType ?? a.card.energyType ?? null;
          const bType = b.card.pokemonType ?? b.card.energyType ?? null;
          const base = getEnergyRank(aType) - getEnergyRank(bType);
          diff = sortDirection === "asc" ? base : -base;
          break;
        }
        case "weakness": {
          const aWeakness = a.card.weakness?.type ?? null;
          const bWeakness = b.card.weakness?.type ?? null;
          const base = getEnergyRank(aWeakness) - getEnergyRank(bWeakness);
          diff = sortDirection === "asc" ? base : -base;
          break;
        }
        case "hp":
          diff = compareNullableNumber(
            a.card.hp ?? a.card.health ?? null,
            b.card.hp ?? b.card.health ?? null,
            sortDirection === "asc",
            true,
          );
          break;
        case "attack":
          diff = compareNullableNumber(
            getCardAttackDamageMax(a.card),
            getCardAttackDamageMax(b.card),
            sortDirection === "asc",
            true,
          );
          break;
        case "retreat-cost":
          diff = compareNullableNumber(
            getRetreatCostCount(a.card),
            getRetreatCostCount(b.card),
            sortDirection === "desc",
            true,
          );
          break;
        case "card-type": {
          const base = getCardTypeRankAsc(a.card) - getCardTypeRankAsc(b.card);
          diff = sortDirection === "asc" ? base : -base;
          break;
        }
        case "ability": {
          const base = getAbilityRankAsc(a.card) - getAbilityRankAsc(b.card);
          diff = sortDirection === "asc" ? base : -base;
          break;
        }
        case "expansion-order":
          diff = compareExpansionOrder(a, b, sortDirection);
          break;
        default:
          diff = 0;
      }
      if (diff !== 0) return diff;
      return compareCollectorNumber(a, b);
    });
  }, [
    isCollectionRoute,
    selectedSetFilters,
    searchQuery,
    selectedBoosterPackFilters,
    selectedRarities,
    selectedPokemonTypes,
    hpMin,
    hpMax,
    attackMin,
    attackMax,
    craftCostMin,
    craftCostMax,
    selectedWeaknessFilters,
    retreatMin,
    retreatMax,
    abilityFilter,
    selectedCopyBuckets,
    selectedPokemonStages,
    selectedExStatuses,
    selectedTrainerTypes,
    sortBy,
    sortDirection,
    collection,
    setOrderById,
  ]);

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

  const [inspectView, setInspectView] = useState<{
    index: number;
    maxIndex: number;
  } | null>(null);
  const [inspectPhase, setInspectPhase] = useState<
    "entering" | "idle" | "exiting"
  >("idle");
  const [inspectOriginRect, setInspectOriginRect] = useState<CardRect | null>(
    null,
  );
  const [inspectExitRect, setInspectExitRect] = useState<CardRect | null>(null);
  const inspectCardRef = useRef<HTMLDivElement>(null);
  const inspectCloseRef = useRef<() => void>(() => {});
  const inspectFinishCloseRef = useRef<() => void>(() => {});
  const inspectPhaseRef = useRef<"entering" | "idle" | "exiting">("idle");
  const inspectNavigateRef = useRef<{ goPrev: () => void; goNext: () => void }>(
    { goPrev: () => {}, goNext: () => {} },
  );
  const INSPECT_ANIM_MS = 280;
  const INSPECT_SLIDE_MS = 250;
  // Ease-in-out so card eases into motion and eases to a stop (no abrupt start or end)
  const INSPECT_EASING = "cubic-bezier(0.45, 0, 0.55, 1)";
  const [inspectSliding, setInspectSliding] = useState<{
    fromIndex: number;
    toIndex: number;
  } | null>(null);
  const [inspectSlidePhase, setInspectSlidePhase] = useState<"start" | "end">(
    "start",
  );
  const [inspectOverlayRevealed, setInspectOverlayRevealed] = useState(false);

  useEffect(() => {
    inspectPhaseRef.current = inspectPhase;
  }, [inspectPhase]);

  // Gradual darken + blur: reveal backdrop one frame after open, fade backdrop on exit. Backdrop is a separate layer from the card so only the dim/blur fades.
  useEffect(() => {
    if (inspectView != null && inspectPhase === "entering") {
      setInspectOverlayRevealed(false);
      const id = requestAnimationFrame(() => {
        requestAnimationFrame(() => setInspectOverlayRevealed(true));
      });
      return () => cancelAnimationFrame(id);
    }
    if (inspectView == null || inspectPhase === "exiting") {
      setInspectOverlayRevealed(false);
    }
  }, [inspectView, inspectPhase]);

  const [syncStatus, setSyncStatus] = useState<
    "idle" | "syncing" | "saved" | "error"
  >("idle");
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
      loadingHintRecentRef.current = loadingHintRecentRef.current
        .slice(-(LOADING_HINT_RECENT_COUNT - 1))
        .concat(next);
    }, 2500);
    return () => clearInterval(intervalId);
  }, [clerkEnabled, isUserLoaded]);

  const setSyncError = (message: string) => {
    setSyncStatus("error");
    setSyncErrorMessage(message);
  };

  const clearSyncError = () => setSyncErrorMessage(null);

  const isSupabaseConfigured = Boolean(COLLECTION_API_BASE);

  // 1. When signed in: load collection from Edge Function; if guest data exists, show prompt instead of auto-merging
  useEffect(() => {
    if (!clerkUser?.id || !COLLECTION_API_BASE) return;
    if (hasLoadedFromCloudRef.current) return;

    const guestData = getGuestCollection();
    const canonicalGuestData = canonicalizeCollection(guestData);
    const hadGuestData = Object.keys(canonicalGuestData).length > 0;

    if (!hadGuestData) {
      hasLoadedFromCloudRef.current = true;
      let cancelled = false;
      (async () => {
        try {
          const token = await session?.getToken();
          if (!token || cancelled) return;
          setSyncStatus("syncing");
          const cloudData = await loadCollectionFromApi(
            token,
            COLLECTION_API_BASE,
          );
          if (cancelled) return;
          const rawCloudData = cloudData ?? {};
          const canonicalCloudData = canonicalizeCollection(rawCloudData);
          const shouldSkipImmediateSave = areCollectionsEqual(
            canonicalCloudData,
            rawCloudData,
          );
          justLoadedFromCloudRef.current = shouldSkipImmediateSave;
          setCollection(canonicalCloudData);
          setSyncStatus("saved");
          clearSyncError();
          setTimeout(() => setSyncStatus("idle"), 3000);
        } catch (e) {
          if (!cancelled)
            setSyncError(`Sync failed: ${getSyncErrorMessage(e)}`);
        }
      })();
      return () => {
        cancelled = true;
      };
    }

    setGuestMergePrompt("loading");
    let cancelled = false;
    (async () => {
      try {
        const token = await session?.getToken();
        if (!token || cancelled) return;
        setSyncStatus("syncing");
        const cloudData = await loadCollectionFromApi(
          token,
          COLLECTION_API_BASE,
        );
        if (cancelled) return;
        setCloudDataForMerge(canonicalizeCollection(cloudData ?? {}));
        setGuestMergePrompt("open");
        setSyncStatus("idle");
      } catch (e) {
        if (!cancelled) {
          setSyncError(`Sync failed: ${getSyncErrorMessage(e)}`);
          setGuestMergePrompt("idle");
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
      setCollection(canonicalizeCollection(getGuestCollection()));
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
    setSyncStatus("syncing");
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(async () => {
      try {
        const token = await session?.getToken();
        if (!token) return;
        await saveCollectionToApi(
          token,
          clerkUser.id,
          canonicalizeCollection(collection),
          COLLECTION_API_BASE,
        );
        setSyncStatus("saved");
        clearSyncError();
        setTimeout(() => setSyncStatus("idle"), 3000);
      } catch (e) {
        console.error("Cloud save failed", e);
        setSyncError(`Cloud save failed: ${getSyncErrorMessage(e)}`);
      }
    }, 2000);
    return () => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    };
  }, [collection, clerkUser, session, COLLECTION_API_BASE]);

  const handleUpdateCount = useCallback((cardId: string, delta: number) => {
    const canonicalCardId = getCanonicalCardId(cardId);
    setCollection((prev) => updateCardCount(prev, canonicalCardId, delta));
  }, []);

  const applyCollectionDelta = useCallback(
    (entry: CollectionDisplayCard, delta: number) => {
      handleUpdateCount(entry.card.id, delta);
    },
    [handleUpdateCount],
  );

  const handleGuestMergeMerge = useCallback(() => {
    const cloud = canonicalizeCollection(cloudDataForMerge ?? {});
    const guest = canonicalizeCollection(getGuestCollection());
    const merged: CollectionState = { ...cloud };
    for (const [cardId, guestCount] of Object.entries(guest)) {
      const cloudCount = merged[cardId] ?? 0;
      merged[cardId] = cloudCount + guestCount;
    }
    setCollection(canonicalizeCollection(merged));
    clearGuestCollection();
    setCloudDataForMerge(null);
    setGuestMergePrompt("idle");
    hasLoadedFromCloudRef.current = true;
    setSyncStatus("syncing");
    clearSyncError();
    // Auto-save will run from collection change and then show saved
  }, [cloudDataForMerge]);

  const handleGuestMergeUseCloudOnly = useCallback(() => {
    const cloud = canonicalizeCollection(cloudDataForMerge ?? {});
    justLoadedFromCloudRef.current = true;
    setCollection(cloud);
    setCloudDataForMerge(null);
    setGuestMergePrompt("idle");
    hasLoadedFromCloudRef.current = true;
    setSyncStatus("saved");
    clearSyncError();
    setTimeout(() => setSyncStatus("idle"), 3000);
  }, [cloudDataForMerge]);

  const handleGuestMergeCancel = useCallback(() => {
    setCloudDataForMerge(null);
    setGuestMergePrompt("idle");
    signOut?.();
  }, []);

  const handleDismissDemoBanner = useCallback(() => {
    setDemoBannerDismissing(true);
  }, []);

  const finishDemoBannerDismiss = useCallback(() => {
    setDemoBannerDismissed(true);
    setDemoBannerDismissing(false);
    setShowDismissedToast(true);
  }, []);

  const handleDontShowDemoBannerAgain = useCallback(() => {
    try {
      window.localStorage.setItem(DEMO_BANNER_DONT_SHOW_KEY, "1");
    } catch {
      // ignore
    }
    setDemoBannerDontShow(true);
    if (showDismissedToast) setToastExiting(true);
  }, [showDismissedToast]);

  const handleDismissToast = useCallback(() => {
    if (!showDismissedToast) return;
    setToastExiting(true);
  }, [showDismissedToast]);

  const finishToastClose = useCallback(() => {
    setShowDismissedToast(false);
    setToastExiting(false);
    setToastRevealed(false);
  }, []);

  // Toast enter: reveal after one frame for slide-in
  useEffect(() => {
    if (showDismissedToast && !toastExiting) {
      setToastRevealed(false);
      const id = requestAnimationFrame(() => {
        requestAnimationFrame(() => setToastRevealed(true));
      });
      return () => cancelAnimationFrame(id);
    }
    if (!showDismissedToast) {
      setToastRevealed(false);
      setToastExiting(false);
    }
  }, [showDismissedToast, toastExiting]);

  useEffect(() => {
    if (!showDismissedToast || toastExiting) return;
    const t = setTimeout(
      () => setToastExiting(true),
      DISMISSED_TOAST_DURATION_SEC * 1000,
    );
    return () => clearTimeout(t);
  }, [showDismissedToast, toastExiting]);

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
                  <Loader2
                    size={14}
                    className="animate-spin text-gray-500 shrink-0"
                  />
                  <span className="hidden xs:inline">Loading...</span>
                </span>
              ) : clerkUser ? (
                <>
                  <span
                    className="text-xs text-gray-500 flex items-center gap-1.5 shrink-0 min-w-0"
                    title={
                      syncStatus === "error"
                        ? (syncErrorMessage ?? undefined)
                        : undefined
                    }
                  >
                    {syncStatus === "syncing" && (
                      <>
                        <Loader2 size={12} className="animate-spin shrink-0" />{" "}
                        <span className="hidden sm:inline truncate">
                          Syncing...
                        </span>
                      </>
                    )}
                    {syncStatus === "saved" && (
                      <>
                        <CheckCircle2
                          size={12}
                          className="text-green-500 shrink-0"
                        />{" "}
                        <span className="hidden sm:inline truncate">Saved</span>
                      </>
                    )}
                    {syncStatus === "error" && (
                      <>
                        <AlertCircle
                          size={12}
                          className="text-red-500 shrink-0"
                        />{" "}
                        <span className="text-red-400 truncate hidden sm:inline">
                          {syncErrorMessage ?? "Error"}
                        </span>
                      </>
                    )}
                    {syncStatus === "idle" && (
                      <>
                        <Cloud size={12} className="text-gray-500 shrink-0" />{" "}
                        <span className="hidden sm:inline truncate">
                          Up to date
                        </span>
                      </>
                    )}
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
                      <Button variant="primary" size="sm">
                        Sign in
                      </Button>
                    </SignInButton>
                  )}
                </>
              )}
            </>
          ) : (
            <span className="text-xs text-gray-500">
              Sign-in not configured
            </span>
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
                <strong>Production key on localhost.</strong> Clerk production
                keys (
                <code className="bg-gray-800 px-1 rounded">pk_live_...</code>)
                do not work on localhost. In Clerk Dashboard, switch to the{" "}
                <strong>Development</strong> instance, copy the publishable key
                (<code className="bg-gray-800 px-1 rounded">pk_test_...</code>),
                and set{" "}
                <code className="bg-gray-800 px-1 rounded">
                  VITE_CLERK_PUBLISHABLE_KEY
                </code>{" "}
                in <code className="bg-gray-800 px-1 rounded">.env.local</code>{" "}
                to that value. Restart the dev server.
              </p>
            ) : (
              <p>
                Sign-in is still loading. Click &quot;Retry sign-in&quot; to
                refresh. If it keeps failing, in Clerk Dashboard (Development)
                go to Configure → Paths and set{" "}
                <strong>Fallback development host</strong> to{" "}
                <code className="bg-gray-800 px-1 rounded">
                  http://localhost:3000
                </code>{" "}
                (or your dev port).
              </p>
            )}
          </div>
        </div>
      )}

      <Button
        variant="primary"
        size="lg"
        fullWidth
        onClick={() => {
          if (lastCollectionSetId) setSelectedSetFilters([lastCollectionSetId]);
          navigate("/collection");
        }}
        className="h-24 flex flex-col items-center justify-center gap-1 py-5 group"
      >
        <Library className="size-8 shrink-0 group-hover:scale-110 transition-transform" />
        <span className="text-lg">My Collection</span>
        {lastCollectionSetId != null &&
          (() => {
            const set = SETS.find((item) => item.id === lastCollectionSetId);
            return set ? (
              <span className="text-[10px] text-gray-200 font-normal leading-tight">
                {set.name}
              </span>
            ) : null;
          })()}
      </Button>

      <Button
        variant="secondary"
        size="lg"
        fullWidth
        onClick={() => navigate("/statistics")}
        className="h-24 flex flex-col items-center justify-center gap-1 group bg-gray-800 border-gray-700"
      >
        <BarChart3 className="group-hover:scale-110 transition-transform text-green-400" />
        <span className="text-lg">Statistics</span>
      </Button>

      {!isSupabaseConfigured && (
        <p className="text-xs text-center text-amber-500 mt-4">
          Cloud sync is unavailable: add VITE_SUPABASE_URL and
          VITE_SUPABASE_ANON_KEY to your environment (e.g. .env.local or
          deployment secrets).
        </p>
      )}
    </div>
  );

  // Transition from 'entering' to 'idle' so CSS animates card from origin to center
  useEffect(() => {
    if (inspectPhase !== "entering" || !inspectView) return;
    const frame = requestAnimationFrame(() => {
      requestAnimationFrame(() => setInspectPhase("idle"));
    });
    return () => cancelAnimationFrame(frame);
  }, [inspectPhase, inspectView]);

  // Trigger slide animation: start at "start" positions, then set "end" so cards animate (outgoing slides out + fade, incoming slides in + fade). Clear sliding state when done.
  useEffect(() => {
    if (!inspectSliding) return;
    setInspectSlidePhase("start");
    const frame = requestAnimationFrame(() => {
      requestAnimationFrame(() => setInspectSlidePhase("end"));
    });
    const done = setTimeout(() => {
      setInspectSliding(null);
      setInspectSlidePhase("start");
      // If user started close while sliding, we just cleared sliding; finish close so overlay doesn't stick.
      if (inspectPhaseRef.current === "exiting") {
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
    if (!location.pathname.startsWith("/collection")) {
      setInspectView(null);
      setInspectPhase("idle");
      setInspectOriginRect(null);
      setInspectExitRect(null);
      setInspectSliding(null);
      setInspectSlidePhase("start");
      return;
    }
    if (inspectView == null) return;
    const filtered = collectionFilteredCards;
    const maxIndex = filtered.length - 1;
    if (inspectView.index < 0 || inspectView.index > maxIndex) {
      setInspectView(null);
      setInspectPhase("idle");
      setInspectOriginRect(null);
      setInspectExitRect(null);
      setInspectSliding(null);
      setInspectSlidePhase("start");
    }
  }, [location.pathname, inspectView, collectionFilteredCards]);

  // Keyboard: Escape to close Inspect View (animated), Arrow Left/Right to navigate (only on collection when inspect open)
  useEffect(() => {
    if (location.pathname !== "/collection" || !inspectView) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        inspectCloseRef.current();
        return;
      }
      if (e.key === "ArrowLeft") {
        inspectNavigateRef.current.goPrev();
        return;
      }
      if (e.key === "ArrowRight") {
        inspectNavigateRef.current.goNext();
        return;
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [location.pathname, inspectView]);

  const openCollectionSearch = useCallback(() => {
    setCollectionSearchOpen(true);
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

  const resetCollectionFilters = useCallback(() => {
    setSelectedSetFilters([]);
    setCollectionSetDropdownOpen(false);
    setCollectionBoosterDropdownOpen(false);
    setSelectedBoosterPackFilters([]);
    setSelectedRarities([]);
    setSelectedPokemonTypes([]);
    setHpMinInput("ANY");
    setHpMaxInput("ANY");
    setAttackMinInput("ANY");
    setAttackMaxInput("ANY");
    setCraftCostMinInput("ANY");
    setCraftCostMaxInput("ANY");
    setSelectedWeaknessFilters([]);
    setRetreatMinInput("");
    setRetreatMaxInput("");
    setAbilityFilter(null);
    setSelectedCopyBuckets([]);
    setSelectedPokemonStages([]);
    setSortBy("collector-number");
    setSortDirection("asc");
    setCollectionSortDropdownOpen(false);
    setSelectedExStatuses([]);
    setSelectedTrainerTypes([]);
  }, []);

  const selectedSortOption =
    SORT_OPTIONS.find((option) => option.id === sortBy) ?? SORT_OPTIONS[0];

  const hasActiveCollectionFilters =
    selectedSetFilters.length > 0 ||
    selectedBoosterPackFilters.length > 0 ||
    selectedRarities.length > 0 ||
    selectedPokemonTypes.length > 0 ||
    hpMinInput !== "ANY" ||
    hpMaxInput !== "ANY" ||
    attackMinInput !== "ANY" ||
    attackMaxInput !== "ANY" ||
    craftCostMinInput !== "ANY" ||
    craftCostMaxInput !== "ANY" ||
    selectedWeaknessFilters.length > 0 ||
    retreatMinInput !== "" ||
    retreatMaxInput !== "" ||
    abilityFilter !== null ||
    selectedCopyBuckets.length > 0 ||
    selectedPokemonStages.length > 0 ||
    sortBy !== "collector-number" ||
    sortDirection !== "asc" ||
    selectedExStatuses.length > 0 ||
    selectedTrainerTypes.length > 0;

  const appliedFilterChips = useMemo<ActiveFilterChip[]>(() => {
    const chips: ActiveFilterChip[] = [];
    const formatRange = (
      label: string,
      minValue: number | null,
      maxValue: number | null,
      bounds: { min: number; max: number },
    ) => {
      const hasMin = minValue != null && minValue !== bounds.min;
      const hasMax = maxValue != null && maxValue !== bounds.max;
      if (!hasMin && !hasMax) return null;
      if (hasMin && hasMax) {
        if (minValue === maxValue) return `${label}: ${minValue}`;
        return `${label}: ${minValue}-${maxValue}`;
      }
      if (hasMin) return `${label}: >=${minValue}`;
      return `${label}: <=${maxValue}`;
    };

    for (const setId of selectedSetFilters) {
      const set = SETS.find((item) => item.id === setId);
      chips.push({
        key: `set:${setId}`,
        content: `Set: ${set?.name ?? setId} (${setId})`,
        onRemove: () =>
          setSelectedSetFilters((prev) =>
            prev.filter((value) => value !== setId),
          ),
      });
    }
    for (const booster of selectedBoosterPackFilters) {
      const boosterName =
        boosterPackOptions.find((option) => option.id === booster)?.name ??
        booster;
      chips.push({
        key: `booster:${booster}`,
        content: `Booster: ${boosterName}`,
        onRemove: () =>
          setSelectedBoosterPackFilters((prev) =>
            prev.filter((value) => value !== booster),
          ),
      });
    }
    if (sortBy !== "collector-number" || sortDirection !== "asc") {
      const sortLabel =
        SORT_OPTIONS.find((option) => option.id === sortBy)?.label ?? "Sort";
      chips.push({
        key: "sort",
        content: `Sort by: ${sortLabel} ${sortDirection === "asc" ? "↑" : "↓"}`,
        onRemove: () => {
          setSortBy("collector-number");
          setSortDirection("asc");
        },
      });
    }
    for (const rarity of selectedRarities) {
      const rarityOption = RARITY_OPTIONS.find(
        (option) => option.value === rarity,
      );
      chips.push({
        key: `rarity:${rarity}`,
        content: rarityOption?.icon ? (
          <img
            src={rarityOption.icon}
            alt={rarity}
            className="h-3.5 w-auto shrink-0"
          />
        ) : (
          (rarityOption?.label ?? rarity)
        ),
        onRemove: () =>
          setSelectedRarities((prev) =>
            prev.filter((value) => value !== rarity),
          ),
      });
    }
    for (const type of selectedPokemonTypes) {
      const typeOption = ENERGY_TYPE_OPTIONS.find(
        (option) => option.value === type,
      );
      chips.push({
        key: `ptype:${type}`,
        content: (
          <span className="inline-flex items-center gap-1">
            {typeOption && (
              <img src={typeOption.icon} alt={type} className="h-3.5 w-3.5" />
            )}
            {type}
          </span>
        ),
        onRemove: () =>
          setSelectedPokemonTypes((prev) =>
            prev.filter((value) => value !== type),
          ),
      });
    }
    for (const weakness of selectedWeaknessFilters) {
      if (weakness === "none") {
        chips.push({
          key: "weakness:none",
          content: "Weakness: None",
          onRemove: () =>
            setSelectedWeaknessFilters((prev) =>
              prev.filter((value) => value !== "none"),
            ),
        });
        continue;
      }
      const weakOption = ENERGY_TYPE_OPTIONS.find(
        (option) => option.value === weakness,
      );
      chips.push({
        key: `weakness:${weakness}`,
        content: (
          <span className="inline-flex items-center gap-1">
            Weakness:
            {weakOption && (
              <img
                src={weakOption.icon}
                alt={weakness}
                className="h-3.5 w-3.5"
              />
            )}
            {weakness}
          </span>
        ),
        onRemove: () =>
          setSelectedWeaknessFilters((prev) =>
            prev.filter((value) => value !== weakness),
          ),
      });
    }
    const hpText = formatRange("HP", hpMin, hpMax, hpBounds);
    if (hpText) {
      chips.push({
        key: "hp",
        content: hpText,
        onRemove: () => {
          setHpMinInput("ANY");
          setHpMaxInput("ANY");
        },
      });
    }
    const attackText = formatRange(
      "Attack",
      attackMin,
      attackMax,
      attackBounds,
    );
    if (attackText) {
      chips.push({
        key: "attack",
        content: attackText,
        onRemove: () => {
          setAttackMinInput("ANY");
          setAttackMaxInput("ANY");
        },
      });
    }
    const retreatText = formatRange(
      "Retreat",
      retreatMin,
      retreatMax,
      retreatBounds,
    );
    if (retreatText) {
      chips.push({
        key: "retreat",
        content: retreatText,
        onRemove: () => {
          setRetreatMinInput("");
          setRetreatMaxInput("");
        },
      });
    }
    const craftText = formatRange(
      "Craft",
      craftCostMin,
      craftCostMax,
      craftCostBounds,
    );
    if (craftText) {
      chips.push({
        key: "craft",
        content: craftText,
        onRemove: () => {
          setCraftCostMinInput("ANY");
          setCraftCostMaxInput("ANY");
        },
      });
    }
    for (const bucket of selectedCopyBuckets) {
      const bucketLabel =
        COPY_BUCKET_OPTIONS.find((option) => option.value === bucket)?.label ??
        bucket;
      chips.push({
        key: `copies:${bucket}`,
        content: bucketLabel,
        onRemove: () =>
          setSelectedCopyBuckets((prev) =>
            prev.filter((value) => value !== bucket),
          ),
      });
    }
    if (abilityFilter === "has" || abilityFilter === "none") {
      chips.push({
        key: "ability",
        content: abilityFilter === "has" ? "Has ability" : "No ability",
        onRemove: () => setAbilityFilter(null),
      });
    }
    for (const stage of selectedPokemonStages) {
      chips.push({
        key: `stage:${stage}`,
        content: `Stage: ${stage}`,
        onRemove: () =>
          setSelectedPokemonStages((prev) =>
            prev.filter((value) => value !== stage),
          ),
      });
    }
    for (const exStatus of selectedExStatuses) {
      const label =
        EX_STATUS_OPTIONS.find((option) => option.value === exStatus)?.label ??
        exStatus;
      chips.push({
        key: `ex:${exStatus}`,
        content: label,
        onRemove: () =>
          setSelectedExStatuses((prev) =>
            prev.filter((value) => value !== exStatus),
          ),
      });
    }
    for (const trainerType of selectedTrainerTypes) {
      const label =
        TRAINER_TYPE_OPTIONS.find((option) => option.value === trainerType)
          ?.label ?? trainerType;
      chips.push({
        key: `trainer:${trainerType}`,
        content: label,
        onRemove: () =>
          setSelectedTrainerTypes((prev) =>
            prev.filter((value) => value !== trainerType),
          ),
      });
    }
    const sectionRank = (key: string) => {
      if (key.startsWith("set:")) return 0;
      if (key.startsWith("booster:")) return 1;
      if (key.startsWith("copies:")) return 2;
      if (key === "sort") return 3;
      if (key.startsWith("rarity:")) return 4;
      if (key.startsWith("ptype:")) return 5;
      if (key.startsWith("weakness:")) return 6;
      if (key === "ability") return 7;
      if (key.startsWith("stage:")) return 8;
      if (key.startsWith("ex:")) return 9;
      if (key.startsWith("trainer:")) return 10;
      if (key === "hp") return 11;
      if (key === "attack") return 12;
      if (key === "craft") return 13;
      if (key === "retreat") return 14;
      return 99;
    };
    const optionRank = (key: string) => {
      if (key.startsWith("set:")) {
        const id = key.replace("set:", "");
        const idx = SETS.findIndex((set) => set.id === id);
        return idx === -1 ? 999 : idx;
      }
      if (key.startsWith("booster:")) {
        const id = key.replace("booster:", "");
        const idx = boosterPackOptions.findIndex((option) => option.id === id);
        return idx === -1 ? 999 : idx;
      }
      if (key.startsWith("copies:")) {
        const id = key.replace("copies:", "") as CopyBucket;
        const idx = COPY_BUCKET_OPTIONS.findIndex(
          (option) => option.value === id,
        );
        return idx === -1 ? 999 : idx;
      }
      if (key.startsWith("rarity:")) {
        const id = key.replace("rarity:", "") as Rarity;
        const idx = RARITY_OPTIONS.findIndex((option) => option.value === id);
        return idx === -1 ? 999 : idx;
      }
      if (key.startsWith("ptype:")) {
        const id = key.replace("ptype:", "") as EnergyType;
        const idx = ENERGY_TYPE_OPTIONS.findIndex(
          (option) => option.value === id,
        );
        return idx === -1 ? 999 : idx;
      }
      if (key.startsWith("weakness:")) {
        const id = key.replace("weakness:", "");
        if (id === "none") return 999;
        const idx = ENERGY_TYPE_OPTIONS.findIndex(
          (option) => option.value === id,
        );
        return idx === -1 ? 999 : idx;
      }
      if (key.startsWith("stage:")) {
        const id = key.replace("stage:", "") as PokemonStage;
        const idx = POKEMON_STAGE_OPTIONS.findIndex((option) => option === id);
        return idx === -1 ? 999 : idx;
      }
      if (key.startsWith("ex:")) {
        const id = key.replace("ex:", "") as ExStatus;
        const idx = EX_STATUS_OPTIONS.findIndex(
          (option) => option.value === id,
        );
        return idx === -1 ? 999 : idx;
      }
      if (key.startsWith("trainer:")) {
        const id = key.replace("trainer:", "") as TrainerSubtype;
        const idx = TRAINER_TYPE_OPTIONS.findIndex(
          (option) => option.value === id,
        );
        return idx === -1 ? 999 : idx;
      }
      return 0;
    };
    return [...chips].sort((a, b) => {
      const sectionDiff = sectionRank(a.key) - sectionRank(b.key);
      if (sectionDiff !== 0) return sectionDiff;
      const optionDiff = optionRank(a.key) - optionRank(b.key);
      if (optionDiff !== 0) return optionDiff;
      return a.key.localeCompare(b.key);
    });
  }, [
    selectedSetFilters,
    selectedBoosterPackFilters,
    boosterPackOptions,
    sortBy,
    sortDirection,
    selectedRarities,
    selectedPokemonTypes,
    selectedWeaknessFilters,
    hpMin,
    hpMax,
    hpBounds,
    attackMin,
    attackMax,
    attackBounds,
    retreatMin,
    retreatMax,
    retreatBounds,
    craftCostMin,
    craftCostMax,
    craftCostBounds,
    selectedCopyBuckets,
    abilityFilter,
    selectedPokemonStages,
    selectedExStatuses,
    selectedTrainerTypes,
  ]);

  // Close search panel on click outside or Escape.
  useEffect(() => {
    if (!collectionSearchOpen && !collectionFiltersOpen) return;
    const handleOutside = (e: MouseEvent | TouchEvent) => {
      const panel = collectionSearchPanelRef.current;
      const filterToggle = collectionFilterToggleRef.current;
      const toggle = collectionSearchToggleRef.current;
      const searchBar = collectionSearchBarRef.current;
      const setDropdown = collectionSetDropdownRef.current;
      const boosterDropdown = collectionBoosterDropdownRef.current;
      const sortDropdown = collectionSortDropdownRef.current;
      const target = e.target as Node;
      if (
        panel?.contains(target) ||
        filterToggle?.contains(target) ||
        toggle?.contains(target) ||
        searchBar?.contains(target)
      ) {
        if (setDropdown && !setDropdown.contains(target))
          setCollectionSetDropdownOpen(false);
        if (boosterDropdown && !boosterDropdown.contains(target))
          setCollectionBoosterDropdownOpen(false);
        if (sortDropdown && !sortDropdown.contains(target))
          setCollectionSortDropdownOpen(false);
        return;
      }
      if (searchQuery.trim().length === 0) {
        setCollectionSearchOpen(false);
      }
      setCollectionSetDropdownOpen(false);
      setCollectionBoosterDropdownOpen(false);
      setCollectionSortDropdownOpen(false);
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (collectionSetDropdownOpen) {
          setCollectionSetDropdownOpen(false);
          return;
        }
        if (collectionBoosterDropdownOpen) {
          setCollectionBoosterDropdownOpen(false);
          return;
        }
        if (collectionSortDropdownOpen) {
          setCollectionSortDropdownOpen(false);
          return;
        }
        setCollectionSearchOpen(false);
      }
    };
    document.addEventListener("mousedown", handleOutside);
    document.addEventListener("touchstart", handleOutside, { passive: true });
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleOutside);
      document.removeEventListener("touchstart", handleOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [
    collectionSearchOpen,
    collectionFiltersOpen,
    collectionSetDropdownOpen,
    collectionBoosterDropdownOpen,
    collectionSortDropdownOpen,
    searchQuery,
  ]);

  // Close search panel when leaving collection route.
  useEffect(() => {
    if (!location.pathname.startsWith("/collection")) {
      setCollectionSearchOpen(false);
      setCollectionFiltersOpen(false);
      setCollectionSetDropdownOpen(false);
      setCollectionBoosterDropdownOpen(false);
      setCollectionSortDropdownOpen(false);
    }
  }, [location.pathname]);

  const renderCollection = () => {
    const filteredCards = collectionFilteredCards;
    const currentInspectEntry =
      inspectView != null ? (filteredCards[inspectView.index] ?? null) : null;
    const currentInspectCard = currentInspectEntry?.card ?? null;
    const canGoLeft = inspectView != null && inspectView.index > 0;
    const canGoRight =
      inspectView != null && inspectView.index < inspectView.maxIndex;

    const startCloseInspect = () => {
      if (!currentInspectCard) {
        finishCloseInspect();
        return;
      }
      // If we're mid-slide, clear sliding state so we render the single card and run the exit animation (avoids stuck overlay).
      setInspectSliding(null);
      setInspectSlidePhase("start");
      const el = document.querySelector(
        `[data-card-rect-id="${currentInspectCard.id}"]`,
      );
      const rect = el?.getBoundingClientRect();
      if (rect) {
        setInspectExitRect({
          left: rect.left,
          top: rect.top,
          width: rect.width,
          height: rect.height,
        });
        // Defer 'exiting' so the single card paints at center first, then animates to grid (otherwise no transition runs).
        requestAnimationFrame(() => setInspectPhase("exiting"));
      } else {
        setInspectExitRect(null);
        setInspectPhase("exiting");
      }
    };

    const finishCloseInspect = () => {
      setInspectView(null);
      setInspectPhase("idle");
      setInspectOriginRect(null);
      setInspectExitRect(null);
      setInspectSliding(null);
      setInspectSlidePhase("start");
    };

    inspectCloseRef.current = startCloseInspect;
    inspectFinishCloseRef.current = finishCloseInspect;

    inspectNavigateRef.current = {
      goPrev: () => {
        if (!inspectView || inspectView.index <= 0) return;
        const nextIndex = inspectView.index - 1;
        setInspectSlidePhase("start");
        setInspectSliding({ fromIndex: inspectView.index, toIndex: nextIndex });
        setInspectView((v) => (v ? { ...v, index: nextIndex } : v));
      },
      goNext: () => {
        if (!inspectView || inspectView.index >= inspectView.maxIndex) return;
        const nextIndex = inspectView.index + 1;
        setInspectSlidePhase("start");
        setInspectSliding({ fromIndex: inspectView.index, toIndex: nextIndex });
        setInspectView((v) => (v ? { ...v, index: nextIndex } : v));
      },
    };

    // Grayscale matches grid: unowned cards are grayscale; interpolate to/from color during open/close
    const inspectCardOwned = currentInspectCard
      ? (collection[currentInspectCard.id] ?? 0) > 0
      : false;
    const grayscaleAtGrid = inspectCardOwned ? 0 : 1;

    // Card dimensions for idle and for sliding cards (same as idle branch)
    const getInspectCardDimensions = (): { w: number; h: number } => {
      if (typeof window === "undefined") return { w: 280, h: 392 };
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const maxW = Math.min(280, vw - 112);
      const w = Math.max(160, maxW);
      const maxH = vh - 128;
      const h = Math.min((w * 3.5) / 2.5, maxH);
      return { w, h };
    };

    // Card position/size for the three phases (entering: from grid, idle: center large, exiting: back to grid or shrink). Card is always fully opaque; grayscale and dark overlay animate.
    const getInspectCardStyle = (): React.CSSProperties => {
      const base: React.CSSProperties = {
        transition: `left ${INSPECT_ANIM_MS}ms ${INSPECT_EASING}, top ${INSPECT_ANIM_MS}ms ${INSPECT_EASING}, width ${INSPECT_ANIM_MS}ms ${INSPECT_EASING}, height ${INSPECT_ANIM_MS}ms ${INSPECT_EASING}, transform ${INSPECT_ANIM_MS}ms ${INSPECT_EASING}, filter ${INSPECT_ANIM_MS}ms ${INSPECT_EASING}`,
        position: "fixed",
        borderRadius: "0.5rem",
        overflow: "hidden",
        border: "2px solid rgb(55 65 81)",
        backgroundColor: "rgb(17 24 39)",
        boxShadow: "0 25px 50px -12px rgb(0 0 0 / 0.5)",
      };
      if (inspectPhase === "entering" && inspectOriginRect) {
        return {
          ...base,
          left: inspectOriginRect.left,
          top: inspectOriginRect.top,
          width: inspectOriginRect.width,
          height: inspectOriginRect.height,
          transform: "none",
          filter: `grayscale(${grayscaleAtGrid})`,
        };
      }
      if (inspectPhase === "exiting") {
        if (inspectExitRect) {
          return {
            ...base,
            left: inspectExitRect.left,
            top: inspectExitRect.top,
            width: inspectExitRect.width,
            height: inspectExitRect.height,
            transform: "none",
            filter: `grayscale(${grayscaleAtGrid})`,
          };
        }
        return {
          ...base,
          left: "50%",
          top: "50%",
          width: 320,
          height: 448,
          transform: "translate(-50%, -50%) scale(0)",
          filter: `grayscale(${grayscaleAtGrid})`,
        };
      }
      // idle: centered, smaller so card never overlaps side arrows or top/bottom chrome (56px sides, 64px top/bottom)
      if (typeof window === "undefined") {
        return {
          ...base,
          left: "50%",
          top: "50%",
          width: 280,
          height: 392,
          transform: "translate(-50%, -50%)",
          filter: "grayscale(0)",
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
        left: "50%",
        top: "50%",
        width: w,
        height: h,
        transform: "translate(-50%, -50%)",
        filter: "grayscale(0)",
      };
    };

    return (
      <div className="flex flex-col h-screen bg-black">
        {/* Inspect View overlay */}
        {inspectView != null && currentInspectCard && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center"
            role="dialog"
            aria-modal="true"
            aria-label="Inspect View"
          >
            {/* Backdrop (dim + blur) as separate layer so it can fade on exit without fading the card */}
            <div
              className={`absolute inset-0 bg-black/70 transition-[opacity,backdrop-filter] duration-200 ease-out ${
                inspectOverlayRevealed
                  ? "opacity-100 backdrop-blur-md"
                  : "opacity-0 backdrop-blur-none"
              }`}
              onClick={startCloseInspect}
              aria-hidden="true"
            />
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              {/* Preload adjacent card images so sliding doesn't trigger load glitches */}
              {inspectView.index > 0 &&
                filteredCards[inspectView.index - 1]?.card.image && (
                  <img
                    src={filteredCards[inspectView.index - 1].card.image}
                    alt=""
                    aria-hidden
                    className="absolute opacity-0 pointer-events-none w-0 h-0 overflow-hidden"
                    loading="eager"
                  />
                )}
              {inspectView.index < inspectView.maxIndex &&
                filteredCards[inspectView.index + 1]?.card.image && (
                  <img
                    src={filteredCards[inspectView.index + 1].card.image}
                    alt=""
                    aria-hidden
                    className="absolute opacity-0 pointer-events-none w-0 h-0 overflow-hidden"
                    loading="eager"
                  />
                )}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  startCloseInspect();
                }}
                className="absolute top-4 right-4 z-10 p-2 rounded-full text-gray-400 hover:text-white hover:bg-white/10 transition-colors pointer-events-auto"
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
                    setInspectSlidePhase("start");
                    setInspectSliding({
                      fromIndex: inspectView.index,
                      toIndex: nextIndex,
                    });
                    setInspectView((v) => (v ? { ...v, index: nextIndex } : v));
                  }}
                  className="absolute left-3 top-1/2 -translate-y-1/2 z-10 p-2 text-gray-400 hover:text-white transition-colors touch-manipulation pointer-events-auto"
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
                    if (
                      !inspectView ||
                      inspectView.index >= inspectView.maxIndex
                    )
                      return;
                    const nextIndex = inspectView.index + 1;
                    setInspectSlidePhase("start");
                    setInspectSliding({
                      fromIndex: inspectView.index,
                      toIndex: nextIndex,
                    });
                    setInspectView((v) => (v ? { ...v, index: nextIndex } : v));
                  }}
                  className="absolute right-3 top-1/2 -translate-y-1/2 z-10 p-2 text-gray-400 hover:text-white transition-colors touch-manipulation pointer-events-auto"
                  aria-label="Next card"
                >
                  <ChevronRight size={24} />
                </button>
              )}
              {inspectSliding ? (
                (() => {
                  const dims = getInspectCardDimensions();
                  const goingNext =
                    inspectSliding.toIndex > inspectSliding.fromIndex;
                  // fromIndex = index we're leaving, toIndex = index we're going to (same for both next and prev).
                  const outgoingCardIndex = inspectSliding.fromIndex;
                  const incomingCardIndex = inspectSliding.toIndex;
                  const baseCardStyle: React.CSSProperties = {
                    position: "fixed",
                    left: "50%",
                    top: "50%",
                    width: dims.w,
                    height: dims.h,
                    marginLeft: -dims.w / 2,
                    marginTop: -dims.h / 2,
                    borderRadius: "0.5rem",
                    overflow: "hidden",
                    border: "2px solid rgb(55 65 81)",
                    backgroundColor: "rgb(17 24 39)",
                    boxShadow: "0 25px 50px -12px rgb(0 0 0 / 0.5)",
                    transition:
                      inspectSlidePhase === "start"
                        ? "none"
                        : `transform ${INSPECT_SLIDE_MS}ms ease-out, opacity ${INSPECT_SLIDE_MS}ms ease-out`,
                    pointerEvents: "none",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  };
                  const atEnd = inspectSlidePhase === "end";
                  const outgoingStyle: React.CSSProperties = {
                    ...baseCardStyle,
                    transform: atEnd
                      ? goingNext
                        ? "translate(-100%, 0)"
                        : "translate(100%, 0)"
                      : "translate(0, 0)",
                    opacity: atEnd ? 0 : 1,
                  };
                  const incomingStyle: React.CSSProperties = {
                    ...baseCardStyle,
                    transform: atEnd
                      ? "translate(0, 0)"
                      : goingNext
                        ? "translate(100%, 0)"
                        : "translate(-100%, 0)",
                    opacity: atEnd ? 1 : 0,
                  };
                  return (
                    <>
                      <div style={outgoingStyle}>
                        <img
                          key={
                            filteredCards[outgoingCardIndex]?.card.id ?? "out"
                          }
                          src={
                            filteredCards[outgoingCardIndex]?.card.image ?? ""
                          }
                          alt={
                            filteredCards[outgoingCardIndex]?.card.name ?? ""
                          }
                          className="w-full h-full object-contain pointer-events-none"
                          loading="eager"
                          decoding="async"
                        />
                      </div>
                      <div style={incomingStyle}>
                        <img
                          key={
                            filteredCards[incomingCardIndex]?.card.id ?? "in"
                          }
                          src={
                            filteredCards[incomingCardIndex]?.card.image ?? ""
                          }
                          alt={
                            filteredCards[incomingCardIndex]?.card.name ?? ""
                          }
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
                    if (
                      e.target === inspectCardRef.current &&
                      inspectPhase === "exiting"
                    )
                      finishCloseInspect();
                  }}
                  onClick={(e) => e.stopPropagation()}
                  className="flex items-center justify-center overflow-hidden pointer-events-auto relative"
                >
                  <img
                    src={currentInspectCard.image}
                    alt={currentInspectCard.name}
                    className="w-full h-full object-contain pointer-events-none"
                    loading="eager"
                    decoding="async"
                  />
                  {/* Darkening overlay (matches grid when at grid position); animates off when opening, on when closing */}
                  <div
                    aria-hidden
                    className="absolute inset-0 pointer-events-none"
                    style={{
                      backgroundColor: CARD_GRID_DARKEN_OVERLAY_COLOR,
                      opacity:
                        !inspectCardOwned &&
                        (inspectPhase === "entering" ||
                          inspectPhase === "exiting")
                          ? CARD_GRID_DARKEN_OVERLAY_OPACITY
                          : 0,
                      transition: `opacity ${INSPECT_ANIM_MS}ms ${INSPECT_EASING}`,
                    }}
                  />
                </div>
              )}
              <div
                className="absolute bottom-8 left-0 right-0 flex flex-col items-center px-4 pointer-events-none"
                style={{ transition: `opacity ${INSPECT_ANIM_MS}ms ease-out` }}
              >
                <p className="text-lg font-medium text-white truncate max-w-full text-center drop-shadow-lg">
                  {currentInspectCard.name}
                </p>
                <p className="text-sm text-gray-500">
                  {currentInspectEntry?.numberLabel ??
                    `#${currentInspectCard.number}`}
                </p>
              </div>
            </div>
          </div>
        )}

        <div className="sticky top-0 z-30 bg-black shrink-0 border-b border-gray-800 backdrop-blur-md">
          <div className="p-4">
            {(() => {
              const progress = getCollectionProgress(collection, selectedSetId);
              const statsHash =
                selectedSetId === "ALL"
                  ? "allsets"
                  : (getSetSlug(selectedSetId) ?? selectedSetId);
              return (
                <>
                  <div className="relative">
                    <div className="flex items-center gap-2 min-w-0">
                      <button
                        onClick={() => navigate("/")}
                        className="p-2 -ml-2 text-gray-400 hover:text-white shrink-0"
                      >
                        <ChevronLeft />
                      </button>
                      <h2 className="text-xl font-bold hidden min-[600px]:block shrink-0">
                        Collection
                      </h2>
                      <button
                        ref={collectionFilterToggleRef}
                        type="button"
                        onClick={() => {
                          setCollectionFiltersOpen((prev) => {
                            if (prev) {
                              setCollectionSetDropdownOpen(false);
                              setCollectionBoosterDropdownOpen(false);
                              setCollectionSortDropdownOpen(false);
                            }
                            return !prev;
                          });
                        }}
                        aria-label="Toggle filters"
                        className={`min-h-[40px] min-w-[40px] px-2 rounded-lg border shrink-0 inline-flex items-center justify-center transition-colors ${collectionFiltersOpen ? "bg-blue-600 border-blue-600 text-white" : "bg-gray-900 border-gray-700 text-gray-200 hover:bg-gray-800 hover:border-gray-600"}`}
                      >
                        <Filter size={16} />
                      </button>
                      <div
                        ref={collectionSearchBarRef}
                        className={`min-w-0 origin-left transform transition-[width,transform] duration-150 ease-out ${collectionSearchOpen ? "mr-1 flex-1 w-auto max-w-full scale-100 min-[600px]:flex-none min-[600px]:w-[min(58vw,34rem)]" : "flex-none w-auto scale-100"}`}
                      >
                        {collectionSearchOpen ? (
                          <div className="relative min-h-[40px] origin-left transform transition-all duration-150 ease-out scale-100">
                            <Search
                              className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500"
                              size={16}
                            />
                            <input
                              ref={collectionSearchInputRef}
                              type="text"
                              placeholder="Search by name or number"
                              value={searchQuery}
                              onChange={(e) => setSearchQuery(e.target.value)}
                              className="w-full min-h-[40px] bg-gray-900 border border-gray-700 rounded-lg pl-9 pr-9 py-2 text-sm text-white focus:outline-none focus:border-blue-500 transition-colors"
                            />
                            {searchQuery.length > 0 && (
                              <button
                                type="button"
                                onClick={() => {
                                  setSearchQuery("");
                                  collectionSearchInputRef.current?.focus();
                                }}
                                className="absolute right-2.5 top-1/2 -translate-y-1/2 h-5 w-5 inline-flex items-center justify-center rounded text-gray-400 hover:text-white hover:bg-gray-800"
                                aria-label="Clear search"
                              >
                                <X size={12} />
                              </button>
                            )}
                          </div>
                        ) : (
                          <button
                            ref={collectionSearchToggleRef}
                            type="button"
                            onClick={openCollectionSearch}
                            aria-label="Open search"
                            className="min-h-[40px] px-3 rounded-lg border shrink-0 transform transition-all duration-150 ease-out active:scale-95 bg-gray-900 border-gray-700 text-gray-200 hover:bg-gray-800 hover:border-gray-600 inline-flex items-center gap-2"
                          >
                            <Search size={16} />
                            <span className="text-sm font-medium">Search</span>
                          </button>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => navigate(`/statistics#${statsHash}`)}
                        className="group/progress flex min-h-[40px] min-w-[3rem] min-[600px]:min-w-[4rem] items-center gap-2 px-2.5 py-2 flex-1 min-[600px]:px-3 rounded-lg border border-gray-700 bg-gray-900 text-left outline-none transition-colors hover:bg-gray-800 hover:border-gray-600 cursor-pointer focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-black focus:border-blue-500"
                        aria-label={`View ${selectedSetId === "ALL" ? "All Sets" : "set"} in Statistics`}
                      >
                        <span className="text-xs font-medium text-blue-400 shrink-0 tabular-nums">
                          {Math.floor(progress.percentage)}%
                        </span>
                        <div className="flex-1 min-w-[16px] h-2.5 min-[600px]:h-3 bg-gray-800 group-hover/progress:bg-gray-900 rounded-full overflow-hidden transition-colors">
                          <div
                            className="bg-gradient-to-r from-blue-600 to-purple-500 h-full rounded-full transition-all duration-1000 ease-out"
                            style={{
                              width: `${Math.floor(progress.percentage)}%`,
                            }}
                          />
                        </div>
                      </button>
                      <div className="ml-auto text-right shrink-0">
                        <div className="text-xs text-gray-500 whitespace-nowrap">
                          {progress.owned} / {progress.total}
                        </div>
                        <div className="text-[10px] text-gray-500 whitespace-nowrap">
                          {progress.totalCopies} total
                        </div>
                      </div>
                    </div>
                    {appliedFilterChips.length > 0 && (
                      <div className="absolute left-0 right-0 top-full mt-2 z-20">
                        <div className="flex flex-wrap gap-1.5 rounded-md border border-gray-800 bg-black/95 p-2 shadow-lg">
                          {appliedFilterChips.map((chip) => (
                            <button
                              key={chip.key}
                              type="button"
                              onClick={chip.onRemove}
                              className="inline-flex items-center gap-1 rounded-md border border-gray-700 bg-gray-900 px-2 py-1 text-[11px] text-gray-200 hover:bg-gray-800"
                              aria-label={`Remove filter ${typeof chip.content === "string" ? chip.content : ""}`}
                            >
                              <span className="inline-flex items-center gap-1">
                                {chip.content}
                              </span>
                              <X size={11} className="text-gray-400" />
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </>
              );
            })()}
          </div>
        </div>
        <div
          ref={collectionScrollRef}
          className="flex-1 min-h-0 overflow-y-auto"
        >
          <div
            className={`${collectionFiltersOpen ? "px-3 md:px-4 pb-4 pt-4" : "px-3 md:px-4 pb-4 pt-0"} touch-pan-y relative`}
          >
            <div
              className={`grid overflow-hidden transition-[grid-template-rows,opacity,transform] duration-200 ease-out will-change-[grid-template-rows,opacity,transform] ${collectionFiltersOpen ? "grid-rows-[1fr] opacity-100 translate-y-0" : "grid-rows-[0fr] opacity-0 -translate-y-1 pointer-events-none"}`}
            >
              <div className="min-h-0 overflow-hidden">
                <div
                  ref={collectionSearchPanelRef}
                  className="border-t border-gray-800 px-3 pb-3 pt-2 space-y-2"
                >
                  <div className="flex items-center justify-end">
                    <button
                      type="button"
                      onClick={resetCollectionFilters}
                      disabled={!hasActiveCollectionFilters}
                      className="h-6 inline-flex items-center gap-1 rounded-md border border-gray-700 bg-gray-900 px-2 text-[10px] text-gray-200 hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <RotateCcw size={11} />
                      <span>Reset all</span>
                    </button>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    <div
                      ref={collectionSetDropdownRef}
                      className="relative rounded-md border border-gray-800 bg-gray-950/60 p-2 space-y-1"
                    >
                      <p className="text-[11px] text-gray-400">Scope</p>
                      <div
                        className={`grid ${selectedSetFilters.length > 0 && boosterPackOptions.length > 1 ? "grid-cols-2" : "grid-cols-1"} gap-1.5`}
                      >
                        <div className="relative">
                          <button
                            type="button"
                            onClick={() => {
                              setCollectionSetDropdownOpen((prev) => !prev);
                              setCollectionBoosterDropdownOpen(false);
                            }}
                            className="w-full flex items-center justify-between gap-2 bg-gray-900 border border-gray-700 text-white text-xs rounded-md px-2 py-1.5 hover:bg-gray-800"
                          >
                            <span className="truncate">
                              {selectedSetFilters.length === 0
                                ? "All Sets"
                                : selectedSetFilters.length === 1
                                  ? (SETS.find(
                                      (set) => set.id === selectedSetFilters[0],
                                    )?.name ?? selectedSetFilters[0])
                                  : `${selectedSetFilters.length} sets selected`}
                            </span>
                            <span className="flex items-center gap-1.5 shrink-0">
                              {selectedSetFilters.length > 1 && (
                                <span className="text-[10px] font-mono text-gray-300 bg-gray-800 px-1.5 py-0.5 rounded">
                                  {selectedSetFilters.length}
                                </span>
                              )}
                              <ChevronDown
                                size={14}
                                className={`transition-transform ${collectionSetDropdownOpen ? "rotate-180" : ""}`}
                              />
                            </span>
                          </button>
                          {collectionSetDropdownOpen && (
                            <div className="absolute left-0 right-0 top-full mt-1 max-h-56 overflow-y-auto z-50 rounded-md border border-gray-700 bg-gray-900 shadow-xl">
                              <button
                                type="button"
                                onClick={() => setSelectedSetFilters([])}
                                className={`w-full px-2 py-1.5 text-left text-xs hover:bg-blue-900/30 ${selectedSetFilters.length === 0 ? "bg-blue-900/60 text-white" : "text-gray-200"}`}
                              >
                                All Sets
                              </button>
                              {SETS.map((set) => {
                                const isSelected = selectedSetFilters.includes(
                                  set.id,
                                );
                                return (
                                  <button
                                    key={set.id}
                                    type="button"
                                    onClick={() =>
                                      setSelectedSetFilters((prev) =>
                                        prev.includes(set.id)
                                          ? prev.filter(
                                              (value) => value !== set.id,
                                            )
                                          : [...prev, set.id],
                                      )
                                    }
                                    className={`w-full flex items-center justify-between gap-2 px-2 py-1.5 text-left text-xs hover:bg-blue-900/30 ${isSelected ? "bg-blue-900/60 text-white" : "text-gray-200"}`}
                                  >
                                    <span className="truncate">{set.name}</span>
                                    <span className="text-[10px] font-mono text-gray-300 bg-gray-800 px-1.5 py-0.5 rounded">
                                      {set.id}
                                    </span>
                                  </button>
                                );
                              })}
                            </div>
                          )}
                        </div>
                        {selectedSetFilters.length > 0 &&
                          boosterPackOptions.length > 1 && (
                            <div
                              ref={collectionBoosterDropdownRef}
                              className="relative"
                            >
                              <button
                                type="button"
                                onClick={() => {
                                  setCollectionBoosterDropdownOpen(
                                    (prev) => !prev,
                                  );
                                  setCollectionSetDropdownOpen(false);
                                }}
                                className="w-full flex items-center justify-between gap-2 bg-gray-900 border border-gray-700 text-white text-xs rounded-md px-2 py-1.5 hover:bg-gray-800"
                              >
                                <span className="truncate">
                                  {selectedBoosterPackFilters.length === 0
                                    ? "All Booster Packs"
                                    : selectedBoosterPackFilters.length === 1
                                      ? (boosterPackOptions.find(
                                          (option) =>
                                            option.id ===
                                            selectedBoosterPackFilters[0],
                                        )?.name ??
                                        selectedBoosterPackFilters[0])
                                      : `${selectedBoosterPackFilters.length} boosters`}
                                </span>
                                <span className="flex items-center gap-1.5 shrink-0">
                                  {selectedBoosterPackFilters.length > 1 && (
                                    <span className="text-[10px] font-mono text-gray-300 bg-gray-800 px-1.5 py-0.5 rounded">
                                      {selectedBoosterPackFilters.length}
                                    </span>
                                  )}
                                  <ChevronDown
                                    size={14}
                                    className={`transition-transform ${collectionBoosterDropdownOpen ? "rotate-180" : ""}`}
                                  />
                                </span>
                              </button>
                              {collectionBoosterDropdownOpen && (
                                <div className="absolute left-0 right-0 top-full mt-1 max-h-56 overflow-y-auto z-50 rounded-md border border-gray-700 bg-gray-900 shadow-xl">
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setSelectedBoosterPackFilters([])
                                    }
                                    className={`w-full px-2 py-1.5 text-left text-xs hover:bg-blue-900/30 ${selectedBoosterPackFilters.length === 0 ? "bg-blue-900/60 text-white" : "text-gray-200"}`}
                                  >
                                    All Booster Packs
                                  </button>
                                  {boosterPackOptions.map((pack) => {
                                    const isSelected =
                                      selectedBoosterPackFilters.includes(
                                        pack.id,
                                      );
                                    return (
                                      <button
                                        key={pack.id}
                                        type="button"
                                        onClick={() =>
                                          setSelectedBoosterPackFilters(
                                            (prev) =>
                                              prev.includes(pack.id)
                                                ? prev.filter(
                                                    (value) =>
                                                      value !== pack.id,
                                                  )
                                                : [...prev, pack.id],
                                          )
                                        }
                                        className={`w-full px-2 py-1.5 text-left text-xs hover:bg-blue-900/30 ${isSelected ? "bg-blue-900/60 text-white" : "text-gray-200"}`}
                                      >
                                        {pack.name}
                                      </button>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          )}
                      </div>
                      <div className="text-[11px] text-gray-400 space-y-1">
                        <span>Copies</span>
                        <div className="flex flex-wrap gap-1.5">
                          {COPY_BUCKET_OPTIONS.map((option) => {
                            const isSelected = selectedCopyBuckets.includes(
                              option.value,
                            );
                            return (
                              <button
                                key={option.value}
                                type="button"
                                onClick={() =>
                                  setSelectedCopyBuckets((prev) =>
                                    prev.includes(option.value)
                                      ? prev.filter(
                                          (value) => value !== option.value,
                                        )
                                      : [...prev, option.value],
                                  )
                                }
                                className={`h-7 px-2 rounded-md border text-[11px] ${isSelected ? "bg-blue-600 border-blue-600 text-white" : "bg-gray-900 border-gray-700 text-gray-200 hover:bg-gray-800"}`}
                              >
                                {option.label}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                    <div className="rounded-md border border-gray-800 bg-gray-950/60 p-2 space-y-2">
                      <p className="text-[11px] text-gray-400">
                        Ordering / View
                      </p>
                      <div className="grid grid-cols-[1fr_auto] gap-1.5">
                        <div
                          ref={collectionSortDropdownRef}
                          className="relative"
                        >
                          <button
                            type="button"
                            onClick={() =>
                              setCollectionSortDropdownOpen((prev) => !prev)
                            }
                            className="w-full flex items-center justify-between gap-2 bg-gray-900 border border-gray-700 text-white text-xs rounded-md px-2 py-1.5 hover:bg-gray-800"
                          >
                            <span className="inline-flex items-center gap-1.5 truncate">
                              <selectedSortOption.icon size={12} />
                              <span className="truncate">
                                Sort by: {selectedSortOption.label}
                              </span>
                            </span>
                            <ChevronDown
                              size={14}
                              className={`transition-transform shrink-0 ${collectionSortDropdownOpen ? "rotate-180" : ""}`}
                            />
                          </button>
                          {collectionSortDropdownOpen && (
                            <div className="absolute left-0 right-0 top-full mt-1 max-h-56 overflow-y-auto z-50 rounded-md border border-gray-700 bg-gray-900 shadow-xl">
                              {SORT_OPTIONS.map((option) => (
                                <button
                                  key={option.id}
                                  type="button"
                                  onClick={() => {
                                    setSortBy(option.id);
                                    setCollectionSortDropdownOpen(false);
                                  }}
                                  className={`w-full flex items-center gap-2 px-2 py-1.5 text-left text-xs hover:bg-blue-900/40 ${sortBy === option.id ? "bg-blue-900/80 text-white" : "text-gray-200"}`}
                                >
                                  <option.icon size={12} />
                                  <span className="truncate">
                                    {option.label}
                                  </span>
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={() =>
                            setSortDirection((prev) =>
                              prev === "asc" ? "desc" : "asc",
                            )
                          }
                          className="h-full min-w-[34px] inline-flex items-center justify-center rounded-md border border-gray-700 bg-gray-900 text-gray-200 hover:bg-gray-800"
                          aria-label={
                            sortDirection === "asc"
                              ? "Sort ascending"
                              : "Sort descending"
                          }
                          title={
                            sortDirection === "asc"
                              ? "Ascending (Up)"
                              : "Descending (Down)"
                          }
                        >
                          <ArrowUp
                            size={13}
                            className={`transition-transform duration-150 ease-out ${sortDirection === "asc" ? "rotate-0" : "rotate-180"}`}
                          />
                        </button>
                      </div>
                      <p className="text-[11px] text-gray-400">Identity</p>
                      <p className="text-[11px] text-gray-400">Rarity</p>
                      <div className="flex flex-wrap gap-1.5">
                        {RARITY_OPTIONS.map((option) => {
                          const isSelected = selectedRarities.includes(
                            option.value,
                          );
                          return (
                            <button
                              key={option.value}
                              type="button"
                              onClick={() =>
                                setSelectedRarities((prev) =>
                                  prev.includes(option.value)
                                    ? prev.filter(
                                        (value) => value !== option.value,
                                      )
                                    : [...prev, option.value],
                                )
                              }
                              className={`min-h-[28px] min-w-[28px] inline-flex items-center justify-center rounded-md border px-1.5 ${isSelected ? "bg-blue-600 border-blue-600" : "bg-gray-900 border-gray-700 hover:bg-gray-800"}`}
                            >
                              {option.icon ? (
                                <img
                                  src={option.icon}
                                  alt={option.value}
                                  className="h-3.5 w-auto"
                                />
                              ) : (
                                <span className="text-[10px] text-white font-semibold">
                                  {option.label}
                                </span>
                              )}
                            </button>
                          );
                        })}
                      </div>
                      <p className="text-[11px] text-gray-400">Pokémon Type</p>
                      <div className="flex flex-wrap gap-1.5">
                        {ENERGY_TYPE_OPTIONS.map((option) => {
                          const isSelected = selectedPokemonTypes.includes(
                            option.value,
                          );
                          return (
                            <button
                              key={option.value}
                              type="button"
                              onClick={() =>
                                setSelectedPokemonTypes((prev) =>
                                  prev.includes(option.value)
                                    ? prev.filter(
                                        (value) => value !== option.value,
                                      )
                                    : [...prev, option.value],
                                )
                              }
                              className={`h-7 inline-flex items-center gap-1 rounded-md border px-2 text-[11px] ${isSelected ? "bg-blue-600 border-blue-600 text-white" : "bg-gray-900 border-gray-700 text-gray-200 hover:bg-gray-800"}`}
                            >
                              <img
                                src={option.icon}
                                alt={option.value}
                                className="h-3.5 w-3.5"
                              />
                              <span>{option.value}</span>
                            </button>
                          );
                        })}
                      </div>
                      <p className="text-[11px] text-gray-400">Battle Traits</p>
                      <p className="text-[11px] text-gray-400">Weakness</p>
                      <div className="flex flex-wrap gap-1.5">
                        {ENERGY_TYPE_OPTIONS.map((option) => {
                          const isSelected = selectedWeaknessFilters.includes(
                            option.value,
                          );
                          return (
                            <button
                              key={option.value}
                              type="button"
                              onClick={() =>
                                setSelectedWeaknessFilters((prev) =>
                                  prev.includes(option.value)
                                    ? prev.filter(
                                        (value) => value !== option.value,
                                      )
                                    : [...prev, option.value],
                                )
                              }
                              className={`h-7 inline-flex items-center gap-1 rounded-md border px-2 text-[11px] ${isSelected ? "bg-blue-600 border-blue-600 text-white" : "bg-gray-900 border-gray-700 text-gray-200 hover:bg-gray-800"}`}
                            >
                              <img
                                src={option.icon}
                                alt={option.value}
                                className="h-3.5 w-3.5"
                              />
                              <span>{option.value}</span>
                            </button>
                          );
                        })}
                        <button
                          type="button"
                          onClick={() =>
                            setSelectedWeaknessFilters((prev) =>
                              prev.includes("none")
                                ? prev.filter((value) => value !== "none")
                                : [...prev, "none"],
                            )
                          }
                          className={`h-7 inline-flex items-center rounded-md border px-2 text-[11px] ${selectedWeaknessFilters.includes("none") ? "bg-blue-600 border-blue-600 text-white" : "bg-gray-900 border-gray-700 text-gray-200 hover:bg-gray-800"}`}
                        >
                          None
                        </button>
                      </div>
                      <p className="text-[11px] text-gray-400">Ability</p>
                      <div className="flex gap-1.5">
                        <button
                          type="button"
                          onClick={() =>
                            setAbilityFilter((prev) =>
                              prev === "has" ? null : "has",
                            )
                          }
                          className={`h-7 px-2 rounded-md border text-[11px] ${abilityFilter === "has" ? "bg-blue-600 border-blue-600 text-white" : "bg-gray-900 border-gray-700 text-gray-200 hover:bg-gray-800"}`}
                        >
                          Has ability
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            setAbilityFilter((prev) =>
                              prev === "none" ? null : "none",
                            )
                          }
                          className={`h-7 px-2 rounded-md border text-[11px] ${abilityFilter === "none" ? "bg-blue-600 border-blue-600 text-white" : "bg-gray-900 border-gray-700 text-gray-200 hover:bg-gray-800"}`}
                        >
                          No ability
                        </button>
                      </div>
                      <p className="text-[11px] text-gray-400">Pokemon Stage</p>
                      <div className="flex flex-wrap gap-1.5">
                        {POKEMON_STAGE_OPTIONS.map((stage) => {
                          const isSelected =
                            selectedPokemonStages.includes(stage);
                          return (
                            <button
                              key={stage}
                              type="button"
                              onClick={() =>
                                setSelectedPokemonStages((prev) =>
                                  prev.includes(stage)
                                    ? prev.filter((value) => value !== stage)
                                    : [...prev, stage],
                                )
                              }
                              className={`h-7 px-2 rounded-md border text-[11px] ${isSelected ? "bg-blue-600 border-blue-600 text-white" : "bg-gray-900 border-gray-700 text-gray-200 hover:bg-gray-800"}`}
                            >
                              {stage}
                            </button>
                          );
                        })}
                      </div>
                      <p className="text-[11px] text-gray-400">Card Type</p>
                      <div className="flex flex-wrap gap-1.5">
                        {EX_STATUS_OPTIONS.map((option) => {
                          const isSelected = selectedExStatuses.includes(
                            option.value,
                          );
                          return (
                            <button
                              key={option.value}
                              type="button"
                              onClick={() =>
                                setSelectedExStatuses((prev) =>
                                  prev.includes(option.value)
                                    ? prev.filter(
                                        (value) => value !== option.value,
                                      )
                                    : [...prev, option.value],
                                )
                              }
                              className={`h-7 px-2 rounded-md border text-[11px] ${isSelected ? "bg-blue-600 border-blue-600 text-white" : "bg-gray-900 border-gray-700 text-gray-200 hover:bg-gray-800"}`}
                            >
                              {option.label}
                            </button>
                          );
                        })}
                      </div>
                      <p className="text-[11px] text-gray-400">Trainer Types</p>
                      <div className="flex flex-wrap gap-1.5">
                        {TRAINER_TYPE_OPTIONS.map((option) => {
                          const isSelected = selectedTrainerTypes.includes(
                            option.value,
                          );
                          return (
                            <button
                              key={option.value}
                              type="button"
                              onClick={() =>
                                setSelectedTrainerTypes((prev) =>
                                  prev.includes(option.value)
                                    ? prev.filter(
                                        (value) => value !== option.value,
                                      )
                                    : [...prev, option.value],
                                )
                              }
                              className={`h-7 px-2 rounded-md border text-[11px] ${isSelected ? "bg-blue-600 border-blue-600 text-white" : "bg-gray-900 border-gray-700 text-gray-200 hover:bg-gray-800"}`}
                            >
                              {option.label}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                  <div className="rounded-md border border-gray-800 bg-gray-950/60 p-2">
                    <p className="text-[11px] text-gray-400 mb-2">Stats</p>
                    <div className="grid grid-cols-1 gap-3">
                      <div className="space-y-2">
                        <DualRangeFilter
                          label="HP"
                          minBound={hpBounds.min}
                          maxBound={hpBounds.max}
                          step={10}
                          minValue={hpMinSliderValue}
                          maxValue={hpMaxSliderValue}
                          onChange={(nextMin, nextMax) => {
                            setHpMinInput(
                              nextMin === hpBounds.min
                                ? "ANY"
                                : String(nextMin),
                            );
                            setHpMaxInput(
                              nextMax === hpBounds.max
                                ? "ANY"
                                : String(nextMax),
                            );
                          }}
                        />
                        <DualRangeFilter
                          label="Attack"
                          minBound={attackBounds.min}
                          maxBound={attackBounds.max}
                          step={10}
                          minValue={attackMinSliderValue}
                          maxValue={attackMaxSliderValue}
                          onChange={(nextMin, nextMax) => {
                            setAttackMinInput(
                              nextMin === attackBounds.min
                                ? "ANY"
                                : String(nextMin),
                            );
                            setAttackMaxInput(
                              nextMax === attackBounds.max
                                ? "ANY"
                                : String(nextMax),
                            );
                          }}
                        />
                        <DualRangeFilter
                          label="Craft Cost"
                          minBound={craftCostBounds.min}
                          maxBound={craftCostBounds.max}
                          allowedValues={craftCostStops}
                          minValue={craftCostMinSliderValue}
                          maxValue={craftCostMaxSliderValue}
                          onChange={(nextMin, nextMax) => {
                            setCraftCostMinInput(
                              nextMin === craftCostBounds.min
                                ? "ANY"
                                : String(nextMin),
                            );
                            setCraftCostMaxInput(
                              nextMax === craftCostBounds.max
                                ? "ANY"
                                : String(nextMax),
                            );
                          }}
                        />
                        <DualRangeFilter
                          label="Retreat Cost"
                          minBound={retreatBounds.min}
                          maxBound={retreatBounds.max}
                          minValue={retreatMinSliderValue}
                          maxValue={retreatMaxSliderValue}
                          onChange={(nextMin, nextMax) => {
                            setRetreatMinInput(
                              nextMin === retreatBounds.min
                                ? ""
                                : String(nextMin),
                            );
                            setRetreatMaxInput(
                              nextMax === retreatBounds.max
                                ? ""
                                : String(nextMax),
                            );
                          }}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div
            key={searchQuery}
            ref={collectionCardsAreaRef}
            className="px-3 md:px-4 transition-[opacity,transform] duration-300 ease-out"
            style={{
              opacity: searchResultsRevealed ? 1 : 0,
              transform: searchResultsRevealed
                ? "translateY(0)"
                : "translateY(12px)",
            }}
          >
            {filteredCards.length === 0 ? (
              <div className="py-20 text-center text-gray-500 flex flex-col items-center">
                <p>No cards found.</p>
              </div>
            ) : filteredCards.length > 50 ? (
              <>
                <div
                  style={{
                    height: collectionVirtualizer.getTotalSize(),
                    position: "relative",
                    width: "100%",
                    marginBottom: 96,
                  }}
                >
                  {collectionVirtualizer.getVirtualItems().map((virtualRow) => (
                    <div
                      key={virtualRow.key}
                      ref={collectionVirtualizer.measureElement}
                      data-index={virtualRow.index}
                      style={{
                        position: "absolute",
                        top: 0,
                        left: 0,
                        width: "100%",
                        transform: `translateY(${virtualRow.start}px)`,
                        gridTemplateColumns: `repeat(${collectionColumnCount}, minmax(0, 1fr))`,
                      }}
                      className="grid gap-3 md:gap-4 select-none"
                    >
                      {filteredCards
                        .slice(
                          virtualRow.index * collectionColumnCount,
                          (virtualRow.index + 1) * collectionColumnCount,
                        )
                        .map((entry, i) => {
                          const card = entry.card;
                          const index =
                            virtualRow.index * collectionColumnCount + i;
                          return (
                            <CardItem
                              key={entry.key}
                              card={card}
                              count={entry.count}
                              numberLabelOverride={entry.numberLabel}
                              showSetInNumber={selectedSetId === "ALL"}
                              setName={
                                selectedSetId === "ALL"
                                  ? SETS.find((s) => s.id === card.set)?.name
                                  : undefined
                              }
                              onIncrement={(searchWasFocused) => {
                                applyCollectionDelta(entry, 1);
                                if (searchWasFocused) focusSearchAndSelectAll();
                              }}
                              onDecrement={(searchWasFocused) => {
                                applyCollectionDelta(entry, -1);
                                if (searchWasFocused) focusSearchAndSelectAll();
                              }}
                              searchInputRef={collectionSearchInputRef}
                              onLongPress={(rect) => {
                                setInspectOriginRect(rect);
                                setInspectExitRect(null);
                                setInspectView({
                                  index,
                                  maxIndex: filteredCards.length - 1,
                                });
                                setInspectPhase("entering");
                              }}
                            />
                          );
                        })}
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div
                className="grid gap-3 md:gap-4 select-none"
                style={{
                  gridTemplateColumns: `repeat(${collectionColumnCount}, minmax(0, 1fr))`,
                }}
              >
                {filteredCards.map((entry, index) => {
                  const card = entry.card;
                  return (
                    <CardItem
                      key={entry.key}
                      card={card}
                      count={entry.count}
                      numberLabelOverride={entry.numberLabel}
                      showSetInNumber={selectedSetId === "ALL"}
                      setName={
                        selectedSetId === "ALL"
                          ? SETS.find((s) => s.id === card.set)?.name
                          : undefined
                      }
                      onIncrement={(searchWasFocused) => {
                        applyCollectionDelta(entry, 1);
                        if (searchWasFocused) focusSearchAndSelectAll();
                      }}
                      onDecrement={(searchWasFocused) => {
                        applyCollectionDelta(entry, -1);
                        if (searchWasFocused) focusSearchAndSelectAll();
                      }}
                      searchInputRef={collectionSearchInputRef}
                      onLongPress={(rect) => {
                        setInspectOriginRect(rect);
                        setInspectExitRect(null);
                        setInspectView({
                          index,
                          maxIndex: filteredCards.length - 1,
                        });
                        setInspectPhase("entering");
                      }}
                    />
                  );
                })}
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
          <button
            onClick={() => navigate("/")}
            className="p-2 -ml-2 text-gray-400 hover:text-white"
          >
            <ChevronLeft />
          </button>
          <h2 className="text-xl font-bold">Statistics</h2>
        </div>
      </div>
      <div className="p-6 space-y-6 pb-12">
        {/* All Sets: always first, links to /collection. Percentile rounded down to hundredths, two decimal places. */}
        {(() => {
          const allStats = getCollectionProgress(collection, "ALL");
          const allPct = Math.floor(allStats.percentage * 100) / 100;
          return (
            <button
              type="button"
              id="allsets"
              onClick={() => navigate("/collection")}
              className={`scroll-mt-24 w-full text-left bg-gray-900 border rounded-xl p-5 shadow-lg transition-colors hover:bg-gray-700 hover:border-gray-600 cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-black ${statsFlashTargetId === "allsets" ? "ring-2 ring-blue-500 border-blue-500" : "border-gray-800"}`}
            >
              <div className="flex items-center justify-between mb-4 gap-3">
                <div className="flex items-center gap-2 min-w-0">
                  <h3 className="text-lg font-bold text-white truncate">
                    All Sets
                  </h3>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-xs text-gray-500 whitespace-nowrap">
                    {allStats.owned} / {allStats.total}
                  </div>
                  <div className="text-[10px] text-gray-500 whitespace-nowrap">
                    {allStats.totalCopies} total
                  </div>
                </div>
              </div>
              <div className="w-full bg-gray-800 rounded-full h-4 overflow-hidden">
                <div
                  className="bg-gradient-to-r from-blue-600 to-purple-500 h-full rounded-full transition-all duration-1000 ease-out"
                  style={{ width: `${allPct}%` }}
                />
              </div>
              <div className="mt-2 text-right">
                <span className="text-sm font-medium text-blue-400">
                  {allPct.toFixed(2)}% Complete
                </span>
              </div>
            </button>
          );
        })()}
        {SETS.map((set) => {
          const stats = getSetProgress(set.id, collection);
          const slug = getSetSlug(set.id);
          const pct = Math.floor(stats.percentage * 100) / 100;
          return (
            <button
              key={set.id}
              type="button"
              id={slug ?? set.id}
              onClick={() => {
                setSelectedSetFilters([set.id]);
                setLastCollectionSetId(set.id);
                navigate("/collection");
              }}
              className={`scroll-mt-24 w-full text-left bg-gray-900 border rounded-xl p-5 shadow-lg transition-colors hover:bg-gray-700 hover:border-gray-600 cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-black ${statsFlashTargetId === (slug ?? set.id) ? "ring-2 ring-blue-500 border-blue-500" : "border-gray-800"}`}
            >
              <div className="flex items-center justify-between mb-4 gap-3">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="shrink-0 text-xs font-mono text-gray-400 bg-gray-800 px-2 py-0.5 rounded">
                    {set.id}
                  </span>
                  <h3 className="text-lg font-bold text-white truncate">
                    {set.name}
                  </h3>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-xs text-gray-500 whitespace-nowrap">
                    {stats.owned} / {stats.total}
                  </div>
                  <div className="text-[10px] text-gray-500 whitespace-nowrap">
                    {stats.totalCopies} total
                  </div>
                </div>
              </div>
              <div className="w-full bg-gray-800 rounded-full h-4 overflow-hidden">
                <div
                  className="bg-gradient-to-r from-blue-600 to-purple-500 h-full rounded-full transition-all duration-1000 ease-out"
                  style={{ width: `${pct}%` }}
                />
              </div>
              <div className="mt-2 text-right">
                <span className="text-sm font-medium text-blue-400">
                  {pct.toFixed(2)}% Complete
                </span>
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
      {(!clerkUser && !demoBannerDismissed && !demoBannerDontShow) ||
      demoBannerDismissing ? (
        <div
          className="overflow-hidden transition-[max-height] duration-200 ease-out"
          style={{ maxHeight: demoBannerDismissing ? 0 : 150 }}
          onTransitionEnd={(e) => {
            if (e.target !== e.currentTarget) return;
            if (demoBannerDismissing) finishDemoBannerDismiss();
          }}
        >
          <div
            className={`sticky top-0 z-40 shrink-0 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 px-4 py-2 bg-amber-500/15 border-b border-amber-500/30 text-sm transition-[opacity,transform] duration-200 ease-out ${
              demoBannerDismissing
                ? "opacity-0 -translate-y-2 pointer-events-none"
                : "opacity-100 translate-y-0"
            }`}
          >
            <span className="text-amber-200 min-w-0 flex-1">
              You&apos;re exploring in demo mode, where your on-device data is
              at risk of being deleted. Sign in to save your collection to the
              cloud.
            </span>
            <div className="flex items-center gap-2 shrink-0">
              <SignInButton mode="modal">
                <Button variant="primary" size="sm">
                  Sign in to save
                </Button>
              </SignInButton>
              <button
                type="button"
                onClick={handleDismissDemoBanner}
                className="p-2 rounded-full text-amber-200/80 hover:text-amber-200 hover:bg-amber-500/20 transition-colors shrink-0"
                aria-label="Dismiss banner"
              >
                <X size={18} />
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {!clerkUser && (showDismissedToast || toastExiting) && (
        <div
          className={`fixed top-4 left-4 right-4 z-40 overflow-hidden rounded-lg bg-gray-800 border border-gray-700 shadow-lg text-sm sm:left-auto sm:right-4 sm:max-w-sm transition-all duration-200 ease-out ${
            toastRevealed && !toastExiting
              ? "opacity-100 translate-y-0"
              : "opacity-0 -translate-y-full"
          }`}
          role="status"
          aria-live="polite"
          onTransitionEnd={(e) => {
            if (e.target !== e.currentTarget) return;
            if (toastExiting) finishToastClose();
          }}
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
              style={{
                animation: `toast-bar-shrink ${DISMISSED_TOAST_DURATION_SEC}s linear forwards`,
              }}
            />
          </div>
        </div>
      )}
      {(guestMergePrompt === "loading" || guestMergePrompt === "open") && (
        <Modal
          isOpen
          onClose={handleGuestMergeCancel}
          title={
            guestMergePrompt === "loading"
              ? "Loading your account…"
              : "You have on-device collection data"
          }
        >
          {guestMergePrompt === "loading" ? (
            <div className="flex flex-col items-center gap-4 py-4">
              <Loader2 size={32} className="animate-spin text-gray-400" />
              <p className="text-sm text-gray-400 text-center">
                Loading your saved collection so you can choose how to combine
                it with your on-device data.
              </p>
              <Button
                variant="secondary"
                size="sm"
                onClick={handleGuestMergeCancel}
              >
                Cancel and stay in demo mode
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              <p className="text-sm text-gray-400">
                You signed in with collection data already on this device.
                Choose how to use it with your account:
              </p>
              <div className="space-y-3">
                <div className="rounded-lg border border-gray-700 bg-gray-800/50 p-4 space-y-2">
                  <Button
                    variant="primary"
                    fullWidth
                    onClick={handleGuestMergeMerge}
                    className="justify-center"
                  >
                    Merge into account
                  </Button>
                  <p className="text-xs text-gray-500">
                    Add on-device and cloud card counts together. On-device data
                    will be deleted.
                  </p>
                </div>
                <div className="rounded-lg border border-gray-700 bg-gray-800/50 p-4 space-y-2">
                  <Button
                    variant="secondary"
                    fullWidth
                    onClick={handleGuestMergeUseCloudOnly}
                    className="justify-center"
                  >
                    Use cloud only
                  </Button>
                  <p className="text-xs text-gray-500">
                    Use cloud card counts only. On-device data will be saved.
                  </p>
                </div>
                <div className="rounded-lg border border-gray-700 bg-gray-800/50 p-4 space-y-2">
                  <Button
                    variant="secondary"
                    fullWidth
                    onClick={handleGuestMergeCancel}
                    className="justify-center border-gray-600"
                  >
                    Cancel
                  </Button>
                  <p className="text-xs text-gray-500">
                    Sign out and return to demo mode. On-device data will be
                    saved.
                  </p>
                </div>
              </div>
            </div>
          )}
        </Modal>
      )}
      <div className="flex-1 min-h-0 overflow-hidden">
        <div
          key={
            location.pathname === "/"
              ? "dashboard"
              : location.pathname.startsWith("/collection")
                ? "collection"
                : location.pathname === "/statistics"
                  ? "statistics"
                  : location.pathname
          }
          className="h-full min-h-0 overflow-hidden animate-fade-in"
        >
          <Routes>
            <Route path="/" element={renderDashboard()} />
            <Route path="/collection" element={renderCollection()} />
            <Route path="/statistics" element={renderStats()} />
          </Routes>
        </div>
      </div>
    </div>
  );
};

export default App;
