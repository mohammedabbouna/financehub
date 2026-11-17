import axios, { AxiosInstance, InternalAxiosRequestConfig } from 'axios';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost/api/v1';

/** Optional filters accepted by GET /actions (all values serialized as strings). */
export type ActionQueryParams = Partial<
  Record<'wallet_id' | 'category_id' | 'type' | 'from' | 'to' | 'month' | 'limit', string | number>
>;

/** Optional filters accepted by GET /budgets. */
export type BudgetQueryParams = Partial<Record<'month' | 'year' | 'period', string | number>>;

class ApiClient {
  private client: AxiosInstance;
  private refreshPromise: Promise<void> | null = null;

  constructor() {
    this.client = axios.create({
      baseURL: API_URL,
      headers: { 'Content-Type': 'application/json' },
    });

    this.client.interceptors.request.use((config: InternalAxiosRequestConfig) => {
      if (typeof window !== 'undefined') {
        const token = localStorage.getItem('financehub_access_token');
        if (token) {
          config.headers.Authorization = `Bearer ${token}`;
        }
      }
      return config;
    });

    this.client.interceptors.response.use(
      (response) => response,
      async (error) => {
        const originalRequest = error.config;
        if (error.response?.status === 401 && !originalRequest._retry) {
          originalRequest._retry = true;

          if (!this.refreshPromise) {
            this.refreshPromise = this.doRefresh();
          }

          try {
            await this.refreshPromise;
            const token = localStorage.getItem('financehub_access_token');
            originalRequest.headers.Authorization = `Bearer ${token}`;
            return this.client(originalRequest);
          } catch {
            this.clearAuth();
            if (typeof window !== 'undefined') {
              window.location.href = '/login';
            }
            return Promise.reject(error);
          } finally {
            this.refreshPromise = null;
          }
        }
        return Promise.reject(error);
      }
    );
  }

  private async doRefresh(): Promise<void> {
    const refreshToken = localStorage.getItem('financehub_refresh_token');
    if (!refreshToken) throw new Error('No refresh token');

    const res = await axios.post(`${API_URL}/auth/refresh`, {
      refresh_token: refreshToken,
    });

    const { access_token, refresh_token } = res.data.tokens;
    localStorage.setItem('financehub_access_token', access_token);
    localStorage.setItem('financehub_refresh_token', refresh_token);
    this.setSessionCookie();
  }

  setTokens(accessToken: string, refreshToken: string) {
    localStorage.setItem('financehub_access_token', accessToken);
    localStorage.setItem('financehub_refresh_token', refreshToken);
    // Mirrors auth state into a cookie so src/middleware.ts can gate routes
    // server-side (middleware cannot read localStorage).
    this.setSessionCookie();
  }

  private setSessionCookie() {
    if (typeof document === 'undefined') return;
    const maxAge = 60 * 60 * 24 * 30; // 30 days — refreshed on every login/refresh
    document.cookie = `financehub_session=1; path=/; max-age=${maxAge}; samesite=lax`;
  }

  private clearSessionCookie() {
    if (typeof document === 'undefined') return;
    document.cookie = 'financehub_session=; path=/; max-age=0; samesite=lax';
  }

  clearAuth() {
    localStorage.removeItem('financehub_access_token');
    localStorage.removeItem('financehub_refresh_token');
    localStorage.removeItem('financehub_user');
    this.clearSessionCookie();
  }

  isAuthenticated(): boolean {
    if (typeof window === 'undefined') return false;
    return !!localStorage.getItem('financehub_access_token');
  }

  // Auth
  async login(email: string, password: string) {
    const res = await this.client.post('/auth/login', { email, password });
    return res.data;
  }

  async register(name: string, email: string, password: string) {
    const res = await this.client.post('/auth/register', { name, email, password });
    return res.data;
  }

  async getMe() {
    const res = await this.client.get('/auth/me');
    return res.data;
  }

  async logout(refreshToken: string) {
    // Raw axios: the client may already have a cleared auth state.
    await axios.post(`${API_URL}/auth/logout`, { refresh_token: refreshToken }).catch(() => undefined);
  }

  // Wallets
  async getWallets() {
    const res = await this.client.get('/wallets');
    return res.data;
  }

  async createWallet(data: Partial<Wallet>) {
    const res = await this.client.post('/wallets', data);
    return res.data;
  }

  async updateWallet(id: number, data: Partial<Wallet>) {
    const res = await this.client.put(`/wallets/${id}`, data);
    return res.data;
  }

  async archiveWallet(id: number) {
    const res = await this.client.patch(`/wallets/${id}/archive`);
    return res.data;
  }

  // Actions
  async getActions(params?: ActionQueryParams) {
    const res = await this.client.get('/actions', { params });
    return res.data;
  }

  async createAction(data: Partial<Action> & { contact_id?: number | null; contact_name?: string | null }) {
    const res = await this.client.post('/actions', data);
    return res.data;
  }

  async updateAction(id: number, data: { category_id?: number | null; description?: string | null; date?: string; tag?: string | null }) {
    const res = await this.client.put(`/actions/${id}`, data);
    return res.data;
  }

  async parseActionAi(text: string) {
    const res = await this.client.post('/actions/parse-ai', { text });
    return res.data;
  }

  // Transfers
  async createTransfer(data: { from_wallet_id: number; to_wallet_id: number; amount: number; description?: string; date?: string }) {
    const res = await this.client.post('/transfers', data);
    return res.data;
  }

  // Categories
  async getCategories() {
    const res = await this.client.get('/categories');
    return res.data;
  }

  async createCategory(data: { name: string; type: string; icon?: string; color?: string; parent_id?: number | null }) {
    const res = await this.client.post('/categories', data);
    return res.data;
  }

  async updateCategory(id: number, data: { name?: string; type?: string; icon?: string; color?: string; parent_id?: number | null }) {
    const res = await this.client.put(`/categories/${id}`, data);
    return res.data;
  }

  async deleteCategory(id: number) {
    const res = await this.client.delete(`/categories/${id}`);
    return res.data;
  }

  // Budgets
  async getBudgets(params?: BudgetQueryParams) {
    const res = await this.client.get('/budgets', { params });
    return res.data;
  }

  async createBudget(data: Partial<Budget>) {
    const res = await this.client.post('/budgets', data);
    return res.data;
  }

  async autoSuggestBudgets() {
    const res = await this.client.post('/budgets/auto-suggest');
    return res.data;
  }

  // Goals
  async getGoals() {
    const res = await this.client.get('/goals');
    return res.data;
  }

  async createGoal(data: Partial<Goal>) {
    const res = await this.client.post('/goals', data);
    return res.data;
  }

  async updateGoalProgress(id: number, current_amount: number) {
    const res = await this.client.post(`/goals/${id}/progress`, { current_amount });
    return res.data;
  }

  // AI Chat
  async sendChatMessage(message: string): Promise<ChatResponse> {
    const res = await this.client.post('/ai/chat', { message });
    return res.data;
  }

  // Monthly report (التقرير الشهري)
  async getMonthlyReport(year: number, month: number): Promise<{ report: MonthlyReport }> {
    const res = await this.client.get(`/reports/${year}/${month}`);
    return res.data;
  }

  // Net worth (صافي الثروة — تجميع يومي تراكمي)
  async getNetWorth(from?: string, to?: string): Promise<NetWorth> {
    const res = await this.client.get('/networth', { params: { from, to } });
    return res.data;
  }

  // CSV export/import (BOM لدعم العربية في Excel)
  async exportActionsCsv(from?: string, to?: string): Promise<Blob> {
    const res = await this.client.get('/export/actions', {
      params: { from, to },
      responseType: 'blob',
    });
    return res.data;
  }

  async analyzeImport(rows: Record<string, unknown>[]): Promise<ImportAnalyzeResponse> {
    const res = await this.client.post('/import/analyze', { rows });
    return res.data;
  }

  async commitImport(rows: unknown[]): Promise<{ saved: number; errors: Array<{ row: number; error: string }>; message: string }> {
    const res = await this.client.post('/import/commit', { rows });
    return res.data;
  }

  // Profile & password (الملف الشخصي)
  async updateProfile(data: { name: string; email: string }): Promise<{ message: string; user: { id: number; name: string; email: string } }> {
    const res = await this.client.put('/auth/profile', data);
    return res.data;
  }

  async changePassword(data: { current_password: string; new_password: string }): Promise<{ message: string }> {
    const res = await this.client.put('/auth/password', data);
    return res.data;
  }

  // AI provider key (per-user Anthropic key; overrides the global env var)
  async getAiKey(): Promise<{ has_key: boolean; masked: string | null; source: string; ai_available: boolean; provider: string; base_url: string | null; model: string | null }> {
    const res = await this.client.get('/auth/ai-key');
    return res.data;
  }

  async getAiModels(): Promise<{ models: string[] }> {
    const res = await this.client.get('/auth/ai-models');
    return res.data;
  }

  async setAiKey(payload: { api_key?: string | null; provider?: string; base_url?: string | null; model?: string | null; clear_key?: boolean }): Promise<{ message: string; has_key: boolean; masked: string | null; source: string; provider: string; base_url: string | null; model: string | null }> {
    const res = await this.client.put('/auth/ai-key', payload);
    return res.data;
  }

  // 2FA (TOTP)
  async setup2fa(): Promise<{ secret: string; otpauth_uri: string; recovery_codes: string[]; message: string }> {
    const res = await this.client.post('/auth/2fa/setup');
    return res.data;
  }
  async verifySetup2fa(code: string): Promise<{ message: string; recovery_codes: string[] }> {
    const res = await this.client.post('/auth/2fa/verify-setup', { code });
    return res.data;
  }

  async verify2fa(challenge: string, code: string): Promise<{ user: { id: number; name: string; email: string }; tokens: { access_token: string; refresh_token: string } }> {
    const res = await this.client.post('/auth/2fa/verify', { challenge, code });
    return res.data;
  }
  async disable2fa(code: string): Promise<{ message: string }> {
    const res = await this.client.post('/auth/2fa/disable', { code });
    return res.data;
  }

  async getChatHistory() {
    const res = await this.client.get('/ai/chat/history');
    return res.data;
  }

  async clearChatHistory() {
    const res = await this.client.delete('/ai/chat/history');
    return res.data;
  }

  // Health
  async getHealthScore() {
    const res = await this.client.get('/health-score');
    return res.data;
  }

  async getHealthScoreHistory() {
    const res = await this.client.get('/health-score/history');
    return res.data;
  }

  // Investments
  async getInvestments() {
    const res = await this.client.get('/investments');
    return res.data;
  }

  async createInvestment(data: Partial<Investment>) {
    const res = await this.client.post('/investments', data);
    return res.data;
  }

  async refreshInvestmentPrice(id: number) {
    const res = await this.client.post(`/investments/${id}/refresh-price`);
    return res.data;
  }

  // Calendar
  async getCalendar(month?: number, year?: number) {
    const res = await this.client.get('/calendar', { params: { month, year } });
    return res.data;
  }

  // Bills
  async getBills() {
    const res = await this.client.get('/bills');
    return res.data;
  }

  async getUpcomingBills(days?: number) {
    const res = await this.client.get('/bills/upcoming', { params: { days } });
    return res.data;
  }

  async createBill(data: Partial<Bill>) {
    const res = await this.client.post('/bills', data);
    return res.data;
  }

  async markBillPaid(id: number) {
    const res = await this.client.post(`/bills/${id}/pay`);
    return res.data;
  }

  // Anomalies
  async getAnomalies() {
    const res = await this.client.get('/anomalies');
    return res.data;
  }

  // Forecast
  async getForecast() {
    const res = await this.client.get('/forecast');
    return res.data;
  }

  // Insights
  async getInsights() {
    const res = await this.client.get('/insights');
    return res.data;
  }

  async generateInsights() {
    const res = await this.client.post('/insights/generate');
    return res.data;
  }

  // Allocations
  async proposeAllocation(amount: number, description: string) {
    const res = await this.client.post('/allocations/propose', { amount, description });
    return res.data;
  }

  async approveAllocation(id: number, status: string, sourceActionId?: number) {
    const res = await this.client.post(`/allocations/${id}/approve`, { status, source_action_id: sourceActionId });
    return res.data;
  }

  async getAllocationRules() {
    const res = await this.client.get('/allocations/rules');
    return res.data;
  }

  async createAllocationRule(data: Partial<AllocationRule>) {
    const res = await this.client.post('/allocations/rules', data);
    return res.data;
  }

  async deleteAllocationRule(id: number) {
    const res = await this.client.delete(`/allocations/rules/${id}`);
    return res.data;
  }

  // Contacts (people directory)
  async getContacts() {
    const res = await this.client.get('/contacts');
    return res.data;
  }

  async createContact(data: Partial<Contact>) {
    const res = await this.client.post('/contacts', data);
    return res.data;
  }

  async updateContact(id: number, data: Partial<Contact>) {
    const res = await this.client.put(`/contacts/${id}`, data);
    return res.data;
  }

  async deleteContact(id: number) {
    const res = await this.client.delete(`/contacts/${id}`);
    return res.data;
  }

  // Debts & lending
  async getDebts(params?: { direction?: string; status?: string; contact_id?: number }) {
    const res = await this.client.get('/debts', { params });
    return res.data;
  }

  async getDebtSummary() {
    const res = await this.client.get('/debts/summary');
    return res.data;
  }

  async createDebt(data: Partial<Debt> & { wallet_id?: number | null }) {
    const res = await this.client.post('/debts', data);
    return res.data;
  }

  async getDebt(id: number) {
    const res = await this.client.get(`/debts/${id}`);
    return res.data;
  }

  async updateDebt(id: number, data: Partial<Debt>) {
    const res = await this.client.put(`/debts/${id}`, data);
    return res.data;
  }

  async deleteDebt(id: number, confirm = false) {
    const res = await this.client.delete(`/debts/${id}`, { params: confirm ? { confirm: 1 } : undefined });
    return res.data;
  }

  async addDebtPayment(
    debtId: number,
    data: { amount: number; payment_date?: string; notes?: string | null; wallet_id?: number | null }
  ) {
    const res = await this.client.post(`/debts/${debtId}/payments`, data);
    return res.data;
  }

  async deleteDebtPayment(debtId: number, paymentId: number) {
    const res = await this.client.delete(`/debts/${debtId}/payments/${paymentId}`);
    return res.data;
  }

  // Notifications
  async getNotifications() {
    const res = await this.client.get('/notifications');
    return res.data;
  }

  async markNotificationRead(id: number) {
    const res = await this.client.post(`/notifications/${id}/read`);
    return res.data;
  }

  async markAllNotificationsRead() {
    const res = await this.client.post('/notifications/read-all');
    return res.data;
  }

  // Recurring transactions
  async getRecurring() {
    const res = await this.client.get('/recurring');
    return res.data;
  }

  async createRecurring(data: {
    name: string;
    frequency: RecurringTransaction['frequency'];
    next_run_date: string;
    is_active?: boolean;
    action_template: Partial<RecurringTemplate> & Pick<RecurringTemplate, 'type' | 'amount' | 'wallet_id'>;
  }) {
    const res = await this.client.post('/recurring', data);
    return res.data;
  }

  async updateRecurring(id: number, data: Record<string, unknown>) {
    const res = await this.client.put(`/recurring/${id}`, data);
    return res.data;
  }

  async toggleRecurring(id: number) {
    const res = await this.client.patch(`/recurring/${id}/toggle`);
    return res.data;
  }

  async runRecurring(id: number) {
    const res = await this.client.post(`/recurring/${id}/run`);
    return res.data;
  }

  async deleteRecurring(id: number) {
    const res = await this.client.delete(`/recurring/${id}`);
    return res.data;
  }

  // Zakat
  async getReconciliationSessions(): Promise<{ sessions: any[] }> {
    const res = await this.client.get('/reconciliation');
    return res.data;
  }
  async createReconciliationSession(data: { filename?: string; rows: any[] }): Promise<{ session_id: number; rows: any[]; message: string }> {
    const res = await this.client.post('/reconciliation', data);
    return res.data;
  }
  async getReconciliationSession(id: number): Promise<{ session: any; rows: any[] }> {
    const res = await this.client.get(`/reconciliation/${id}`);
    return res.data;
  }
  async autoMatchReconciliation(id: number): Promise<{ matched: number; rows: any[] }> {
    const res = await this.client.post(`/reconciliation/${id}/auto-match`);
    return res.data;
  }
  async matchReconciliation(id: number, rowId: number, actionId: number | null): Promise<{ message: string; rows: any[] }> {
    const res = await this.client.post(`/reconciliation/${id}/match`, { row_id: rowId, action_id: actionId });
    return res.data;
  }
  async ignoreReconciliation(id: number, rowId: number): Promise<{ message: string; rows: any[] }> {
    const res = await this.client.post(`/reconciliation/${id}/ignore`, { row_id: rowId });
    return res.data;
  }
  async createActionFromReconciliation(id: number, rowId: number, walletId: number): Promise<{ message: string; rows: any[] }> {
    const res = await this.client.post(`/reconciliation/${id}/create-action`, { row_id: rowId, wallet_id: walletId });
    return res.data;
  }
  async completeReconciliation(id: number): Promise<{ message: string }> {
    const res = await this.client.post(`/reconciliation/${id}/complete`);
    return res.data;
  }

  async getZakatCalculation() {
    const res = await this.client.get('/zakat/calculate');
    return res.data as ZakatCalculation;
  }

  async getZakatSnapshots() {
    const res = await this.client.get('/zakat/snapshots');
    return res.data as { snapshots: ZakatSnapshot[] };
  }

  async saveZakatSnapshot(notes?: string) {
    const res = await this.client.post('/zakat/snapshots', { notes });
    return res.data as { message: string; snapshot: ZakatCalculation & { id: number } };
  }

  // Gold
  async getGoldPrice(refresh = false) {
    const res = await this.client.get('/gold/price', { params: refresh ? { refresh: 1 } : undefined });
    return res.data as GoldPrice;
  }

  async getGoldHoldings() {
    const res = await this.client.get('/gold/holdings');
    return res.data as GoldHoldingsResponse;
  }

  // Tontines (العمّارية)
  async getTontines() {
    const res = await this.client.get('/tontines');
    return res.data as { tontines: Tontine[] };
  }

  async getTontine(id: number) {
    const res = await this.client.get(`/tontines/${id}`);
    return res.data as { tontine: Tontine };
  }

  async createTontine(data: {
    name: string;
    amount: number;
    frequency: 'weekly' | 'monthly';
    start_date: string;
    manager_name?: string;
    notes?: string;
  }) {
    const res = await this.client.post('/tontines', data);
    return res.data as { message: string; tontine: Tontine };
  }

  async updateTontine(id: number, data: Record<string, unknown>) {
    const res = await this.client.put(`/tontines/${id}`, data);
    return res.data as { message: string; tontine: Tontine };
  }

  async deleteTontine(id: number) {
    const res = await this.client.delete(`/tontines/${id}`);
    return res.data;
  }

  async addTontineMember(tontineId: number, data: { name: string; phone?: string; position?: number; is_self?: boolean }) {
    const res = await this.client.post(`/tontines/${tontineId}/members`, data);
    return res.data as { message: string; member: TontineMember };
  }

  async deleteTontineMember(tontineId: number, memberId: number) {
    const res = await this.client.delete(`/tontines/${tontineId}/members/${memberId}`);
    return res.data;
  }

  async addTontinePayment(
    tontineId: number,
    data: { member_id: number; due_date: string; amount?: number; wallet_id?: number; notes?: string }
  ) {
    const res = await this.client.post(`/tontines/${tontineId}/payments`, data);
    return res.data as { message: string; created: boolean; payment: TontinePayment };
  }

  async deleteTontinePayment(tontineId: number, paymentId: number) {
    const res = await this.client.delete(`/tontines/${tontineId}/payments/${paymentId}`);
    return res.data;
  }
}

export const api = new ApiClient();

/**
 * Extract a human-readable message from an axios error.
 * Backend errors use `{ error: string }`; everything else gets a fallback.
 */
export function apiErrorMessage(error: unknown, fallback = 'حدث خطأ غير متوقع'): string {
  if (typeof error === 'object' && error !== null) {
    const maybeResponse = (error as { response?: { data?: { error?: unknown; message?: unknown } } }).response;
    const data = maybeResponse?.data;
    if (typeof data?.error === 'string' && data.error) return data.error;
    if (typeof data?.message === 'string' && data.message) return data.message;
  }
  if (error instanceof Error && error.message && !/network/i.test(error.message)) {
    return error.message;
  }
  return fallback;
}

// Re-import for type usage
import type {
  Wallet,
  Action,
  Budget,
  Goal,
  Investment,
  Bill,
  AllocationRule,
  Contact,
  Debt,
  RecurringTransaction,
  RecurringTemplate,
  ZakatCalculation,
  ZakatSnapshot,
  GoldPrice,
  GoldHoldingsResponse,
  Tontine,
  TontineMember,
  TontinePayment,
  ChatResponse,
  MonthlyReport,
  NetWorth,
  ImportAnalyzeResponse,
} from '@/types';
