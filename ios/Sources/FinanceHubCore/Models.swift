import Foundation

// MARK: - Generic JSON value

public enum JSONValue: Codable, Sendable, Equatable {
    case null
    case bool(Bool)
    case int(Int)
    case double(Double)
    case string(String)
    case array([JSONValue])
    case object([String: JSONValue])

    public init(from decoder: Decoder) throws {
        let c = try decoder.singleValueContainer()
        if c.decodeNil() { self = .null; return }
        if let b = try? c.decode(Bool.self) { self = .bool(b); return }
        if let i = try? c.decode(Int.self) { self = .int(i); return }
        if let d = try? c.decode(Double.self) { self = .double(d); return }
        if let s = try? c.decode(String.self) { self = .string(s); return }
        if let a = try? c.decode([JSONValue].self) { self = .array(a); return }
        if let o = try? c.decode([String: JSONValue].self) { self = .object(o); return }
        throw DecodingError.dataCorruptedError(in: c, debugDescription: "Unsupported JSON value")
    }

    public func encode(to encoder: Encoder) throws {
        var c = encoder.singleValueContainer()
        switch self {
        case .null: try c.encodeNil()
        case .bool(let b): try c.encode(b)
        case .int(let i): try c.encode(i)
        case .double(let d): try c.encode(d)
        case .string(let s): try c.encode(s)
        case .array(let a): try c.encode(a)
        case .object(let o): try c.encode(o)
        }
    }
}

// MARK: - User & Auth

public struct User: Codable, Sendable, Identifiable {
    public let id: Int
    public let name: String
    public let email: String
    public let createdAt: String
    public let totpEnabled: Bool?
    public var totpEnabledValue: Bool { totpEnabled ?? false }
}

public struct AuthTokens: Codable, Sendable {
    public let accessToken: String
    public let refreshToken: String
    public let expiresIn: Int
}

public struct AuthResponse: Codable, Sendable {
    public let user: User?
    public let tokens: AuthTokens?
    public let requires2fa: Bool?
    public let challenge: String?
}

public struct TwoFAVerifyRequest: Codable, Sendable {
    public let challenge: String
    public let code: String
}

// MARK: - Wallet

public enum WalletType: String, Codable, Sendable {
    case cash, bank, investment, savings, emergency
}

public struct Wallet: Codable, Sendable, Identifiable {
    public let id: Int
    public let userId: Int
    public let name: String
    public let type: WalletType
    public let currency: String
    public let balance: Double
    public let icon: String
    public let color: String
    public let isArchived: Bool
    public let createdAt: String

    public init(id: Int, userId: Int, name: String, type: WalletType, currency: String, balance: Double, icon: String, color: String, isArchived: Bool, createdAt: String) {
        self.id = id; self.userId = userId; self.name = name; self.type = type; self.currency = currency; self.balance = balance; self.icon = icon; self.color = color; self.isArchived = isArchived; self.createdAt = createdAt
    }
}

// MARK: - Category

public enum CategoryType: String, Codable, Sendable {
    case income, expense
}

public struct Category: Codable, Sendable, Identifiable {
    public let id: Int
    public let userId: Int?
    public let name: String
    public let type: CategoryType
    public let parentId: Int?
    public let icon: String
    public let color: String
    public let isSystem: Bool
}

// MARK: - Action

public enum ActionType: String, Codable, Sendable {
    case deposit, withdraw, transfer, invest, borrow, repay
}

public struct Action: Codable, Sendable, Identifiable {
    public let id: Int
    public let userId: Int
    public let walletId: Int
    public let targetWalletId: Int?
    public let type: ActionType
    public let amount: Double
    public let categoryId: Int?
    public let description: String
    public let date: String
    public let tag: String?
    public let receiptUrl: String?
    public let transferGroupId: String?
    public let categoryName: String?
    public let categoryIcon: String?
    public let categoryColor: String?
    public let walletName: String?
    public let targetWalletName: String?
    public let createdAt: String
}

// MARK: - Budget

public enum BudgetPeriod: String, Codable, Sendable {
    case weekly, monthly, yearly
}

public struct Budget: Codable, Sendable, Identifiable {
    public let id: Int
    public let userId: Int
    public let categoryId: Int
    public let period: BudgetPeriod
    public let amount: Double
    public let isPercentage: Bool
    public let autoSuggested: Bool
    public let isActive: Bool
    public let spent: Double
    public let categoryName: String
    public let categoryIcon: String
    public let categoryColor: String
}

// MARK: - Goal

public struct Goal: Codable, Sendable, Identifiable {
    public let id: Int
    public let userId: Int
    public let name: String
    public let targetAmount: Double
    public let currentAmount: Double
    public let targetDate: String?
    public let linkedWalletId: Int?
    public let icon: String
    public let color: String
    public let isCompleted: Bool
    public let progress: Double?
}

// MARK: - Investment

public enum AssetType: String, Codable, Sendable {
    case stock, crypto, gold, realestate, other
}

public struct Investment: Codable, Sendable, Identifiable {
    public let id: Int
    public let userId: Int
    public let walletId: Int?
    public let assetType: AssetType
    public let name: String
    public let ticker: String?
    public let priceUpdatedAt: String?
    public let quantity: Double
    public let purchasePrice: Double
    public let currentPrice: Double
    public let currency: String
    public let currentValue: Double
    public let unrealizedPnl: Double
    public let notes: String?
}

// MARK: - Bill

public struct Bill: Codable, Sendable, Identifiable {
    public let id: Int
    public let userId: Int
    public let name: String
    public let amount: Double
    public let dueDate: String
    public let categoryId: Int?
    public let walletId: Int?
    public let isPaid: Bool
    public let reminderDaysBefore: Int
    public let categoryName: String?
    public let categoryIcon: String?
}

// MARK: - Insight / Anomaly

public struct Insight: Codable, Sendable, Identifiable {
    public let id: Int
    public let userId: Int
    public let type: String
    public let message: String
    public let supportingData: [String: JSONValue]?
    public let isRead: Bool
    public let createdAt: String
}

public enum AnomalySeverity: String, Codable, Sendable {
    case low, medium, high, critical
}

public struct Anomaly: Codable, Sendable, Identifiable {
    public let id: Int
    public let userId: Int
    public let actionId: Int?
    public let reason: String
    public let severity: AnomalySeverity
    public let supportingData: [String: JSONValue]?
    public let isRead: Bool
    public let description: String?
    public let amount: Double?
    public let categoryName: String?
    public let createdAt: String
}

// MARK: - Health Score

public struct HealthScoreBreakdownItem: Codable, Sendable {
    public let score: Double
    public let weight: Double
    public let label: String
    public let contribution: Double
}

public struct HealthScore: Codable, Sendable {
    public let score: Double
    public let breakdown: [String: HealthScoreBreakdownItem]
    public let factors: [Double]
}

// MARK: - Calendar / Forecast

public struct CalendarAction: Codable, Sendable {
    public let id: Int?
    public let type: String?
    public let amount: Double?
    public let date: String?
    public let description: String?
    public let categoryName: String?
    public let categoryIcon: String?
    public let categoryColor: String?
    public let walletName: String?
}

public struct CalendarBill: Codable, Sendable {
    public let id: Int?
    public let name: String?
    public let amount: Double?
    public let dueDate: String?
    public let isPaid: Bool?
    public let categoryName: String?
    public let categoryIcon: String?
}

public struct CalendarDay: Codable, Sendable, Identifiable {
    public let date: String
    public let day: Int
    public let dayOfWeek: Int
    public let isToday: Bool
    public let actions: [CalendarAction]
    public let bills: [CalendarBill]
    public let totalIncome: Double
    public let totalExpense: Double
    public let hasEvents: Bool
    public var id: String { date }
}

public struct CalendarResponse: Codable, Sendable {
    public let year: Int
    public let month: Int
    public let days: [CalendarDay]
}

public struct ForecastPoint: Codable, Sendable {
    public let date: String
    public let projectedBalance: Double
    public let lowerBound: Double
    public let upperBound: Double
}

public struct Forecast: Codable, Sendable {
    public let forecast: [ForecastPoint]
    public let avgDailyNet: Double
    public let currentBalance: Double
    public let upcomingBills: Double
    public let estimatedRunway: Double?
    public let estimatedDepletionDate: String?
}

// MARK: - Chat

public enum ChatRole: String, Codable, Sendable {
    case user, assistant
}

public struct ChatMessage: Codable, Sendable {
    public let id: Int?
    public let role: ChatRole
    public let message: String
    public let createdAt: String?

    public init(id: Int? = nil, role: ChatRole, message: String, createdAt: String? = nil) {
        self.id = id
        self.role = role
        self.message = message
        self.createdAt = createdAt
    }
}

public struct AffordabilityCheck: Codable, Sendable {
    public let key: String
    public let label: String
    public let passed: Bool
    public let detail: String
}

public struct AffordabilityAnalysis: Codable, Sendable {
    public let question: String
    public let targetAmount: Double?
    public let verdict: String
    public let verdictLabel: String
    public let assets: Double
    public let liquidAfter: Double
    public let monthlyExpenses: Double
    public let reserveTarget: Double
    public let avgDailyNet: Double
    public let projected30d: Double
    public let obligations30d: Double
    public let liabilities: Double
    public let checks: [AffordabilityCheck]
}

public struct ChatResponse: Codable, Sendable {
    public let response: String
    public let aiAvailable: Bool
    public let analysis: AffordabilityAnalysis?
}

// MARK: - Monthly Report

public struct MonthlyReportDelta: Codable, Sendable {
    public let value: Double
    public let percent: Double
}

public struct MonthlyReportCategory: Codable, Sendable {
    public let id: Int
    public let name: String
    public let icon: String
    public let color: String
    public let total: Double
    public let count: Int
    public let percent: Double
}

public struct MonthlyReportBudget: Codable, Sendable {
    public let name: String
    public let limit: Double
    public let spent: Double
    public let percent: Double
}

public struct MonthlyReport: Codable, Sendable {
    public let year: Int
    public let month: Int
    public let periodLabel: String
    public let summary: MonthlyReportSummary
    public let vsLastMonth: MonthlyReportVsLastMonth
    public let categories: [MonthlyReportCategory]
    public let budgets: [MonthlyReportBudget]
    public let assets: Double
    public let narrative: String
    public let recommendations: [String]
    public let aiUsed: Bool
    public let generatedAt: String
}

public struct MonthlyReportSummary: Codable, Sendable {
    public let income: Double
    public let expenses: Double
    public let net: Double
    public let savingsRate: Double
    public let transactions: Int
    public let borrowed: Double
    public let repaid: Double
}

public struct MonthlyReportVsLastMonth: Codable, Sendable {
    public let income: MonthlyReportDelta
    public let expenses: MonthlyReportDelta
    public let label: String
}

// MARK: - Net Worth

public struct NetWorthPoint: Codable, Sendable {
    public let date: String
    public let balance: Double
}

public struct NetWorth: Codable, Sendable {
    public let points: [NetWorthPoint]
    public let from: String
    public let to: String
    public let current: Double
    public let start: Double
    public let end: Double
    public let change: Double
    public let changePercent: Double?
}

// MARK: - Import

public struct ImportRow: Codable, Sendable, Identifiable {
    public let row: Int
    public let date: String
    public let type: String
    public let amount: Double
    public let categoryId: Int?
    public let categoryName: String?
    public let walletId: Int?
    public let description: String
    public let valid: Bool
    public let warnings: [String]
    public var id: Int { row }
}

public struct ImportAnalyzeResponse: Codable, Sendable {
    public let rows: [ImportRow]
    public let total: Int
    public let valid: Int
    public let walletId: Int?
}

// MARK: - Allocation

public struct AllocationRule: Codable, Sendable, Identifiable {
    public let id: Int
    public let targetType: String
    public let targetId: Int
    public let allocationType: String
    public let allocationValue: Double
    public let priority: Int
}

public struct AllocationProposal: Codable, Sendable {
    public let targetType: String
    public let targetId: Int?
    public let targetName: String
    public let allocationType: String
    public let percentage: Double?
    public let amount: Double
    public let reason: String?
}

// MARK: - Contacts & Debts

public struct Contact: Codable, Sendable, Identifiable {
    public let id: Int
    public let userId: Int
    public let name: String
    public let phone: String?
    public let notes: String?
    public let createdAt: String
    public let updatedAt: String
    public let totalLent: Double
    public let totalBorrowed: Double
    public let debtCount: Int
}

public enum DebtDirection: String, Codable, Sendable {
    case lentTo = "lent_to"
    case borrowedFrom = "borrowed_from"
}

public enum DebtStatus: String, Codable, Sendable {
    case pending, partial, paid
}

public struct Debt: Codable, Sendable, Identifiable {
    public let id: Int
    public let userId: Int
    public let contactId: Int
    public let direction: DebtDirection
    public let amount: Double
    public let dueDate: String?
    public let notes: String?
    public let actionId: Int?
    public let createdAt: String
    public let updatedAt: String
    public let contactName: String
    public let contactPhone: String?
    public let actionDescription: String?
    public let remaining: Double
    public let paidAmount: Double
    public let lastPaymentDate: String?
    public let status: DebtStatus
}

public struct DebtPayment: Codable, Sendable, Identifiable {
    public let id: Int
    public let userId: Int
    public let debtId: Int
    public let amount: Double
    public let paymentDate: String
    public let notes: String?
    public let actionId: Int?
    public let createdAt: String
    public let actionDescription: String?
}

public struct DebtSummary: Codable, Sendable {
    public let lentTo: Double
    public let borrowedFrom: Double
    public let net: Double
    public let openCount: Int
    public let paidCount: Int
    public let overdueCount: Int
    public let lentToCount: Int
    public let borrowedFromCount: Int
}

// MARK: - Parsed Action / Notifications / Recurring

public struct ParsedAction: Codable, Sendable {
    public let type: String?
    public let amount: JSONValue?
    public let categoryId: JSONValue?
    public let categoryName: String?
    public let walletId: JSONValue?
    public let walletName: String?
    public let targetWalletId: JSONValue?
    public let description: String?
    public let date: String?
    public let tag: String?
    public let contactId: JSONValue?
    public let contactName: String?
    public let confidence: Double?
    public let error: String?
}

public struct AppNotification: Codable, Sendable, Identifiable {
    public let id: Int
    public let userId: Int
    public let type: String
    public let title: String
    public let body: String
    public let link: String?
    public let refKey: String?
    public let isRead: Bool
    public let createdAt: String
}

public struct RecurringTemplate: Codable, Sendable {
    public let type: String
    public let amount: Double?
    public let walletId: Int?
    public let targetWalletId: Int?
    public let categoryId: Int?
    public let description: String?
    public let tag: String?
}

public enum RecurringFrequency: String, Codable, Sendable {
    case daily, weekly, monthly, yearly
}

public struct RecurringTransaction: Codable, Sendable, Identifiable {
    public let id: Int
    public let userId: Int
    public let name: String
    public let actionTemplate: RecurringTemplate
    public let frequency: RecurringFrequency
    public let nextRunDate: String
    public let isActive: Bool
    public let createdAt: String
    public let updatedAt: String
}

// MARK: - Zakat

public struct ZakatBreakdown: Codable, Sendable {
    public let cash: Double
    public let goldGrams: Double
    public let goldValue: Double
    public let investmentsValue: Double
    public let receivables: Double
    public let liabilities: Double
    public let netWealth: Double
}

public struct ZakatNisab: Codable, Sendable {
    public let grams: Double
    public let value: Double?
    public let goldPriceDzdGram: Double?
    public let reached: Bool
}

public struct GoldPrice: Codable, Sendable {
    public let priceUsdOz: Double
    public let usdDzd: Double
    public let priceDzdGram: Double
    public let priceDzdGramDisplay: String?
    public let priceDate: String
    public let source: String
    public let isStale: Bool
}

public struct ZakatCalculation: Codable, Sendable {
    public let asOf: String
    public let breakdown: ZakatBreakdown
    public let rate: Double
    public let nisab: ZakatNisab
    public let zakatDue: Double
    public let isDue: Bool
    public let goldPrice: GoldPrice?
}

public struct ZakatSnapshot: Codable, Sendable, Identifiable {
    public let id: Int
    public let snapshotDate: String
    public let cash: Double
    public let goldValue: Double
    public let investmentsValue: Double
    public let receivables: Double
    public let liabilities: Double
    public let netWealth: Double
    public let nisabValue: Double?
    public let nisabGrams: Double
    public let zakatDue: Double
    public let goldPriceDzdGram: Double?
    public let notes: String?
    public let createdAt: String
}

// MARK: - Gold

public struct GoldHolding: Codable, Sendable, Identifiable {
    public let id: Int
    public let name: String
    public let grams: Double
    public let purchasePrice: Double
    public let recordedPrice: Double
    public let valueNow: Double
    public let pnl: Double
}

public struct GoldHoldingsSummary: Codable, Sendable {
    public let totalGrams: Double
    public let totalValue: Double
    public let totalCost: Double
    public let pnl: Double
}

public struct GoldHoldingsPlan: Codable, Sendable {
    public let targetGrams: Double
    public let missingGrams: Double
    public let months: Int
    public let perMonth: Double?
    public let totalToSave: Double?
}

public struct GoldHoldingsResponse: Codable, Sendable {
    public let price: GoldPrice?
    public let holdings: [GoldHolding]
    public let summary: GoldHoldingsSummary
    public let plan: GoldHoldingsPlan
}

// MARK: - Tontine

public struct TontineMember: Codable, Sendable, Identifiable {
    public let id: Int
    public let name: String
    public let phone: String?
    public let position: Int
    public let isSelf: Bool
    public let isActive: Bool
}

public struct TontineCycleReceiver: Codable, Sendable {
    public let memberId: Int
    public let name: String
    public let position: Int
}

public struct TontineCycle: Codable, Sendable, Identifiable {
    public let index: Int
    public let dueDate: String
    public let expected: Double
    public let collected: Double
    public let paidCount: Int
    public let memberCount: Int
    public let receiver: TontineCycleReceiver?
    public let status: String
    public let isPast: Bool
    public let isCurrent: Bool
    public let isFuture: Bool
    public var id: Int { index }
}

public struct TontinePayment: Codable, Sendable, Identifiable {
    public let id: Int
    public let memberId: Int
    public let memberName: String?
    public let isSelf: Bool?
    public let dueDate: String
    public let amount: Double
    public let walletId: Int?
    public let actionId: Int?
    public let notes: String?
    public let createdAt: String?
}

public struct TontineDelinquent: Codable, Sendable {
    public let memberId: Int
    public let name: String
    public let phone: String?
    public let position: Int
    public let dueDate: String
}

public struct Tontine: Codable, Sendable, Identifiable {
    public let id: Int
    public let name: String
    public let amount: Double
    public let frequency: String
    public let startDate: String
    public let managerName: String?
    public let notes: String?
    public let status: String
    public let createdAt: String
    public let memberCount: Int
    public let expectedPerCycle: Double
    public let totalCollected: Double
    public let nextDueDate: String?
    public let currentCycle: TontineCycle?
    public let members: [TontineMember]
    public let cycles: [TontineCycle]
    public let delinquents: [TontineDelinquent]
    public let payments: [TontinePayment]?
}

// MARK: - Misc

public struct HealthResponse: Codable, Sendable {
    public let status: String
    public let version: String
    public let timestamp: String
    public let service: String
}

public struct GenericMessage: Codable, Sendable {
    public let message: String?
    public let error: String?
    public let code: Int?
}

// MARK: - List responses (wrapped)

public struct WalletsResponse: Codable, Sendable {
    public let wallets: [Wallet]
    public let totalAssets: Double?
}

public struct ActionsResponse: Codable, Sendable {
    public let actions: [Action]
}

public struct CategoriesResponse: Codable, Sendable {
    public let categories: [Category]
}

public struct BudgetsResponse: Codable, Sendable {
    public let budgets: [Budget]
}

public struct GoalsResponse: Codable, Sendable {
    public let goals: [Goal]
}

public struct ContactsResponse: Codable, Sendable {
    public let contacts: [Contact]
}

public struct DebtsResponse: Codable, Sendable {
    public let debts: [Debt]
    public let summary: DebtSummary
}

public struct RecurringResponse: Codable, Sendable {
    public let recurring: [RecurringTransaction]
}

public struct NotificationsResponse: Codable, Sendable {
    public let notifications: [AppNotification]
    public let unreadCount: Int
}

public struct TontinesResponse: Codable, Sendable {
    public let tontines: [Tontine]
}

public struct TontineResponse: Codable, Sendable {
    public let tontine: Tontine
}

public struct InvestmentsResponse: Codable, Sendable {
    public let investments: [Investment]
    public let totalValue: Double?
    public let totalCost: Double?
    public let totalPnl: Double?
}

public struct BillsResponse: Codable, Sendable {
    public let bills: [Bill]
}

public struct InsightsResponse: Codable, Sendable {
    public let insights: [Insight]
}

public struct Client: Codable, Sendable, Identifiable {
    public let id: Int
    public let userId: Int?
    public let name: String
    public let email: String?
    public let phone: String?
    public let company: String?
    public let notes: String?
    public let createdAt: String?
}

public struct ClientsResponse: Codable, Sendable {
    public let clients: [Client]
}

public struct Invoice: Codable, Sendable, Identifiable {
    public let id: Int
    public let number: String?
    public let clientId: Int?
    public let clientName: String?
    public let issueDate: String?
    public let dueDate: String?
    public let status: String?
    public let total: Double?
    public let createdAt: String?
}

public struct InvoicesResponse: Codable, Sendable {
    public let invoices: [Invoice]
    public let summary: [String: JSONValue]?
}

public struct AuditLogsResponse: Codable, Sendable {
    public let logs: [[String: JSONValue]]
}

public struct AnomaliesResponse: Codable, Sendable {
    public let anomalies: [Anomaly]
}
