import type { LucideIcon } from 'lucide-react';
import {
  AlertCircle,
  ArrowDownToLine,
  ArrowLeftRight,
  ArrowUpFromLine,
  Banknote,
  BarChart3,
  Bell,
  BookOpen,
  Bot,
  Brain,
  Briefcase,
  Calculator,
  Calendar,
  Car,
  Check,
  CheckCheck,
  ClipboardList,
  Clock,
  Coins,
  CreditCard,
  Eye,
  FileText,
  Folder,
  Gamepad2,
  Gift,
  HandCoins,
  Handshake,
  Home,
  Inbox,
  Info,
  Landmark,
  Laptop,
  Lightbulb,
  LifeBuoy,
  Lock,
  Package,
  Pause,
  Pencil,
  Printer,
  Phone,
  PiggyBank,
  Pin,
  Pizza,
  Plane,
  Play,
  Plus,
  Receipt,
  RefreshCw,
  Save,
  ScanSearch,
  ScrollText,
  Search,
  Settings,
  ShieldCheck,
  Shirt,
  Siren,
  ShoppingCart,
  Stethoscope,
  Tag,
  Target,
  Trash2,
  TrendingDown,
  TrendingUp,
  Trophy,
  TriangleAlert,
  User,
  Users,
  Utensils,
  Wallet,
  X,
  Zap,
} from 'lucide-react';

/**
 * One icon set for the whole interface.
 *
 * Data in this app still carries emoji (navigation labels, seeded category
 * icons such as `🍽️`, action types) — `Glyph` turns any of those keys into
 * the matching lucide line icon, so screens render a single icon set at one
 * size and stroke without changing what the data means.
 *
 *   <Glyph name={category.icon} className="text-gray-500" />
 */
const MAP: Record<string, LucideIcon> = {
  // Navigation & shell
  '📊': BarChart3,
  '💰': Wallet,
  '💳': CreditCard,
  '🔄': RefreshCw,
  '📋': ClipboardList,
  '🎯': Target,
  '📈': TrendingUp,
  '🧾': Receipt,
  '👥': Users,
  '🕌': HandCoins,
  '🥇': Coins,
  '🤝': Handshake,
  '📅': Calendar,
  '🤖': Bot,
  '💡': Lightbulb,
  '⚙': Settings,
  '⚙️': Settings,
  '🏦': Landmark,
  '🔍': Search,
  '🔔': Bell,
  '🧠': Brain,
  '🏠': Home,

  // States & feedback
  '⚠': TriangleAlert,
  '⚠️': TriangleAlert,
  '✅': CheckCheck,
  '✓': Check,
  '✕': X,
  '🎉': Check,
  'ℹ': Info,
  '🚨': Siren,
  '⚡': Zap,
  '🔒': Lock,
  '❗': AlertCircle,

  // Money & categories
  '💵': Banknote,
  '💸': TrendingDown,
  '📤': ArrowUpFromLine,
  '📥': ArrowDownToLine,
  '📌': Pin,
  '📦': Package,
  '💼': Briefcase,
  '💻': Laptop,
  '🎁': Gift,
  '🎀': Gift,
  '🍽️': Utensils,
  '🚗': Car,
  '🎮': Gamepad2,
  '🏥': Stethoscope,
  '🩺': Stethoscope,
  '📚': BookOpen,
  '👕': Shirt,
  '✈️': Plane,
  '🛡️': ShieldCheck,
  '🍕': Pizza,
  '🛒': ShoppingCart,
  '🐷': PiggyBank,
  '🆘': LifeBuoy,
  '👛': Wallet,
  '🧮': Calculator,
  '📜': ScrollText,
  '🏆': Trophy,
  '👤': User,
  '📞': Phone,

  // Controls
  '💾': Save,
  '✏': Pencil,
  '✏️': Pencil,
  '📂': Folder,
  '🗂': Folder,
  '🗂️': Folder,
  '➕': Plus,
  '🗑': Trash2,
  '▶': Play,
  '⏸': Pause,
  '📭': Inbox,
  '📄': FileText,
  '📝': Pencil,
  '📉': TrendingDown,
  '🖨️': Printer,
  '🖨': Printer,

  // Semantic aliases used by empty states and panels
  inbox: Inbox,
  alert: TriangleAlert,
  info: Info,
  receipt: Receipt,
  wallet: Wallet,
  calendar: Calendar,
  search: Search,
  user: User,
  users: Users,
  file: FileText,
  clock: Clock,
  eye: Eye,
  scan: ScanSearch,
  'arrow-in': ArrowDownToLine,
  'arrow-out': ArrowUpFromLine,
  transfer: ArrowLeftRight,
};

export function iconFor(name?: string | null): LucideIcon {
  if (!name) return Tag;
  const direct = MAP[name];
  if (direct) return direct;
  const stripped = MAP[name.replace(/️/g, '')];
  if (stripped) return stripped;
  return Tag;
}

interface GlyphProps {
  /** Emoji key, alias, or nothing for the default tag icon. */
  name?: string | null;
  /** One size across the interface: 16 small, 18 default, 22 empty state. */
  size?: number;
  strokeWidth?: number;
  className?: string;
}

export default function Glyph({ name, size = 18, strokeWidth = 1.5, className }: GlyphProps) {
  const Icon = iconFor(name);
  return <Icon size={size} strokeWidth={strokeWidth} aria-hidden="true" className={className} />;
}
