export interface User {
  id: number;
  name: string;
  email: string;
  created_at: string;
  totp_enabled?: boolean;
}

export interface AuthTokens {
  access_token: string;
  refresh_token: string;
  expires_in: number;
}

export interface Wallet {
  id: number;
  user_id: number;
  name: string;
  type: 'cash' | 'bank' | 'investment' | 'savings' | 'emergency';
  currency: string;
  balance: number;
  icon: string;
  color: string;
  is_archived: boolean;
  created_at: string;
}

export interface Category {
  id: number;
  user_id: number | null;
  name: string;
  type: 'income' | 'expense';
  parent_id: number | null;
  icon: string;
  color: string;
  is_system: boolean;
}

export interface Action {
  id: number;
  user_id: number;
  wallet_id: number;
  target_wallet_id: number | null;
  type: 'deposit' | 'withdraw' | 'transfer' | 'invest' | 'borrow' | 'repay';
  amount: number;
  category_id: number | null;
  description: string;
  date: string;
  tag: string | null;
  receipt_url: string | null;
  transfer_group_id: string | null;
  category_name?: string;
  category_icon?: string;
  category_color?: string;
  wallet_name?: string;
  target_wallet_name?: string;
  created_at: string;
}

export interface Budget {
  id: number;
  user_id: number;
  category_id: number;
  period: 'monthly' | 'weekly' | 'yearly';
  amount: number;
  is_percentage: boolean;
  auto_suggested: boolean;
  is_active: boolean;
  spent: number;
  category_name: string;
  category_icon: string;
  category_color: string;
}

export interface Goal {
  id: number;
  user_id: number;
  name: string;
  target_amount: number;
  current_amount: number;
  target_date: string | null;
  linked_wallet_id: number | null;
  icon: string;
  color: string;
  is_completed: boolean;
  progress?: number;
}

export interface Investment {
  id: number;
  user_id: number;
  wallet_id: number | null;
  asset_type: 'stock' | 'crypto' | 'gold' | 'realestate' | 'other';
  name: string;
  ticker: string | null;
  price_updated_at: string | null;
  quantity: number;
  purchase_price: number;
  current_price: number;
  currency: string;
  current_value: number;
  unrealized_pnl: number;
  notes?: string | null;
}

export interface Bill {
  id: number;
  user_id: number;
  name: string;
  amount: number;
  due_date: string;
  category_id: number | null;
  wallet_id: number | null;
  is_paid: boolean;
  reminder_days_before: number;
  category_name?: string;
  category_icon?: string;
}

export interface Insight {
  id: number;
  user_id: number;
  type: string;
  message: string;
  supporting_data: Record<string, unknown> | null;
  is_read: boolean;
  created_at: string;
}

export interface Anomaly {
  id: number;
  user_id: number;
  action_id: number | null;
  reason: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  supporting_data: Record<string, unknown> | null;
  is_read: boolean;
  description?: string;
  amount?: number;
  category_name?: string;
  created_at: string;
}

export interface HealthScore {
  score: number;
  breakdown: Record<string, { score: number; weight: number; label: string; contribution: number }>;
  factors: number[];
}

export interface CalendarDay {
  date: string;
  day: number;
  day_of_week: number;
  is_today: boolean;
  actions: Action[];
  bills: Bill[];
  total_income: number;
  total_expense: number;
  has_events: boolean;
}

export interface Forecast {
  forecast: { date: string; projected_balance: number; lower_bound: number; upper_bound: number }[];
  avg_daily_net: number;
  current_balance: number;
  upcoming_bills: number;
  estimated_runway: number | null;
  estimated_depletion_date: string | null;
}

export interface ChatMessage {
  id?: number;
  role: 'user' | 'assistant';
  message: string;
  created_at?: string;
}

// ─── Phase 4: Monthly report + affordability consultation ────────────────────

export interface AffordabilityCheck {
  key: 'reserve' | 'runway' | 'obligations';
  label: string;
  passed: boolean;
  detail: string;
}

export interface AffordabilityAnalysis {
  question: string;
  target_amount: number | null;
  verdict: 'yes' | 'caution' | 'no';
  verdict_label: string;
  assets: number;
  liquid_after: number;
  monthly_expenses: number;
  reserve_target: number;
  avg_daily_net: number;
  projected_30d: number;
  obligations_30d: number;
  liabilities: number;
  checks: AffordabilityCheck[];
}

export interface ChatResponse {
  response: string;
  ai_available: boolean;
  analysis?: AffordabilityAnalysis | null;
}

export interface MonthlyReportDelta {
  value: number;
  percent: number;
}

export interface MonthlyReport {
  year: number;
  month: number;
  period_label: string;
  period: { from: string; to: string };
  summary: {
    income: number;
    expenses: number;
    net: number;
    savings_rate: number;
    transactions: number;
    borrowed: number;
    repaid: number;
  };
  vs_last_month: {
    income: MonthlyReportDelta;
    expenses: MonthlyReportDelta;
    label: string;
  };
  categories: Array<{
    id: number;
    name: string;
    icon: string;
    color: string;
    total: number;
    count: number;
    percent: number;
  }>;
  budgets: Array<{
    name: string;
    limit: number;
    spent: number;
    percent: number;
  }>;
  assets: number;
  narrative: string;
  recommendations: string[];
  ai_used: boolean;
  generated_at: string;
}

// ─── Phase 5: Net worth + CSV import/export ──────────────────────────────────

export interface NetWorthPoint {
  date: string;
  balance: number;
}

export interface NetWorth {
  points: NetWorthPoint[];
  from: string;
  to: string;
  current: number;
  start: number;
  end: number;
  change: number;
  change_percent: number | null;
}

export interface ImportRow {
  row: number;
  date: string;
  type: 'deposit' | 'withdraw' | 'borrow' | 'repay' | 'invest';
  amount: number;
  category_id: number | null;
  category_name: string | null;
  wallet_id: number | null;
  description: string;
  valid: boolean;
  warnings: string[];
}

export interface ImportAnalyzeResponse {
  rows: ImportRow[];
  total: number;
  valid: number;
  wallet_id: number | null;
}

export interface AllocationRule {
  id: number;
  target_type: 'wallet' | 'category';
  target_id: number;
  allocation_type: 'percentage' | 'fixed';
  allocation_value: number;
  priority: number;
}

export interface AllocationProposal {
  target_type: string;
  target_id: number | null;
  target_name: string;
  allocation_type: string;
  percentage: number | null;
  amount: number;
  reason?: string;
}

export interface Contact {
  id: number;
  user_id: number;
  name: string;
  phone: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  /** Aggregates across the contact's open debts (0 when none). */
  total_lent: number;
  total_borrowed: number;
  debt_count: number;
}

export interface Debt {
  id: number;
  user_id: number;
  contact_id: number;
  /** lent_to = I lent money out · borrowed_from = I borrowed it in. */
  direction: 'lent_to' | 'borrowed_from';
  amount: number;
  due_date: string | null;
  notes: string | null;
  action_id: number | null;
  created_at: string;
  updated_at: string;
  contact_name: string;
  contact_phone?: string | null;
  action_description?: string | null;
  /** amount minus payments, floored at 0 — always computed. */
  remaining: number;
  paid_amount: number;
  last_payment_date: string | null;
  status: 'pending' | 'partial' | 'paid';
}

export interface DebtPayment {
  id: number;
  user_id: number;
  debt_id: number;
  amount: number;
  payment_date: string;
  notes: string | null;
  action_id: number | null;
  created_at: string;
  action_description?: string | null;
}

export interface DebtSummary {
  lent_to: number;
  borrowed_from: number;
  net: number;
  open_count: number;
  paid_count: number;
  overdue_count: number;
  lent_to_count: number;
  borrowed_from_count: number;
}

/**
 * Shape returned by the AI parse endpoint (POST /actions/parse-ai).
 * Every field is optional — the model may omit some — except after
 * normalization on the backend, which fills sensible defaults.
 */
export interface ParsedAction {
  type?: string;
  amount?: number | string | null;
  category_id?: number | string | null;
  category_name?: string | null;
  wallet_id?: number | string | null;
  wallet_name?: string | null;
  target_wallet_id?: number | string | null;
  description?: string;
  date?: string;
  tag?: string | null;
  contact_id?: number | string | null;
  contact_name?: string | null;
  confidence?: number;
  /** Set when the backend could not produce a usable action (e.g. no wallet). */
  error?: string;
}

export interface AppNotification {
  id: number;
  user_id: number;
  /** bill_due | bill_overdue | budget_warning | budget_exceeded | debt_due | debt_overdue | recurring_failed | anomaly */
  type: string;
  title: string;
  body: string;
  /** In-app route to open, e.g. "/bills". */
  link: string | null;
  ref_key: string | null;
  is_read: boolean;
  created_at: string;
}

/** Stored as JSON on recurring_transactions; decoded by the API. */
export interface RecurringTemplate {
  type: Action['type'];
  amount: number | null;
  wallet_id: number | null;
  target_wallet_id?: number | null;
  category_id?: number | null;
  description?: string | null;
  tag?: string | null;
}

export interface RecurringTransaction {
  id: number;
  user_id: number;
  name: string;
  action_template: RecurringTemplate;
  frequency: 'daily' | 'weekly' | 'monthly' | 'yearly';
  next_run_date: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

// ─── Phase 3: Zakat ───────────────────────────────────────────────────────────

export interface ZakatBreakdown {
  cash: number;
  gold_grams: number;
  gold_value: number;
  investments_value: number;
  receivables: number;
  liabilities: number;
  net_wealth: number;
}

export interface ZakatCalculation {
  as_of: string;
  breakdown: ZakatBreakdown;
  rate: number;
  nisab: {
    grams: number;
    value: number | null;
    gold_price_dzd_gram: number | null;
    reached: boolean;
  };
  zakat_due: number;
  is_due: boolean;
  gold_price: GoldPrice | null;
}

export interface ZakatSnapshot {
  id: number;
  snapshot_date: string;
  cash: number;
  gold_value: number;
  investments_value: number;
  receivables: number;
  liabilities: number;
  net_wealth: number;
  nisab_value: number | null;
  nisab_grams: number;
  zakat_due: number;
  gold_price_dzd_gram: number | null;
  notes: string | null;
  created_at: string;
}

// ─── Phase 3: Gold ────────────────────────────────────────────────────────────

export interface GoldPrice {
  price_usd_oz: number;
  usd_dzd: number;
  price_dzd_gram: number;
  price_dzd_gram_display?: string;
  price_date: string;
  source: string;
  is_stale: boolean;
}

export interface GoldHolding {
  id: number;
  name: string;
  grams: number;
  purchase_price: number;
  recorded_price: number;
  value_now: number;
  pnl: number;
}

export interface GoldHoldingsResponse {
  price: GoldPrice | null;
  holdings: GoldHolding[];
  summary: { total_grams: number; total_value: number; total_cost: number; pnl: number };
  plan: {
    target_grams: number;
    missing_grams: number;
    months: number;
    per_month: number | null;
    total_to_save: number | null;
  };
}

// ─── Phase 3: Tontine (العمّارية) ─────────────────────────────────────────────

export interface TontineMember {
  id: number;
  name: string;
  phone: string | null;
  position: number;
  is_self: boolean;
  is_active: boolean;
}

export interface TontineCycle {
  index: number;
  due_date: string;
  expected: number;
  collected: number;
  paid_count: number;
  member_count: number;
  receiver: { member_id: number; name: string; position: number } | null;
  status: 'pending' | 'due' | 'partial' | 'paid' | 'overdue' | 'missed';
  is_past: boolean;
  is_current: boolean;
  is_future: boolean;
}

export interface TontinePayment {
  id: number;
  member_id: number;
  member_name?: string;
  is_self?: boolean;
  due_date: string;
  amount: number;
  wallet_id: number | null;
  action_id: number | null;
  notes: string | null;
  created_at?: string;
}

export interface TontineDelinquent {
  member_id: number;
  name: string;
  phone: string | null;
  position: number;
  due_date: string;
}

export interface Tontine {
  id: number;
  name: string;
  amount: number;
  frequency: 'weekly' | 'monthly';
  start_date: string;
  manager_name: string | null;
  notes: string | null;
  status: 'active' | 'completed' | 'cancelled';
  created_at: string;
  member_count: number;
  expected_per_cycle: number;
  total_collected: number;
  next_due_date: string | null;
  current_cycle: TontineCycle | null;
  members: TontineMember[];
  cycles: TontineCycle[];
  delinquents: TontineDelinquent[];
  payments?: TontinePayment[];
}
