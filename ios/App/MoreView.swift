import SwiftUI
import FinanceHubCore
import FinanceHubUI

struct MoreView: View {
    let api: APIClient

    var body: some View {
        List {
            Section("المالية") {
                NavigationLink("الفئات") { CategoriesView(api: api) }
                NavigationLink("الميزانيات") { BudgetsView(api: api) }
                NavigationLink("الأهداف") { GoalsView(api: api) }
                NavigationLink("الأشخاص") { ContactsView(api: api) }
                NavigationLink("الديون") { DebtsView(api: api) }
                NavigationLink("المتكرر") { RecurringView(api: api) }
                NavigationLink("الإشعارات") { NotificationsView(api: api) }
                NavigationLink("الاستثمارات") { InvestmentsView(api: api) }
                NavigationLink("الفواتير") { BillsView(api: api) }
                NavigationLink("التقويم") { CalendarView(api: api) }
                NavigationLink("تصدير (CSV)") { ExportView(api: api) }
                NavigationLink("استيراد (CSV)") { ImportView(api: api) }
            }
            Section("الجزائر") {
                NavigationLink("الزكاة") { ZakatView(api: api) }
                NavigationLink("الذهب") { GoldView(api: api) }
                NavigationLink("العمّارية") { TontinesView(api: api) }
            }
            Section("الذكاء والتحليل") {
                NavigationLink("المساعد المالي (AI)") { AIChatView(api: api) }
                NavigationLink("التقرير الشهري") { ReportView(api: api) }
                NavigationLink("صافي الثروة") { NetWorthView(api: api) }
                NavigationLink("الرؤى") { InsightsView(api: api) }
                NavigationLink("Health Score") { HealthScoreView(api: api) }
                NavigationLink("Forecast") { ForecastView(api: api) }
                NavigationLink("الشذوذ") { AnomaliesView(api: api) }
            }
            Section("أعمال") {
                NavigationLink("العملاء") { ClientsView(api: api) }
                NavigationLink("الفواتير (Invoices)") { InvoicesView(api: api) }
                NavigationLink("Audit Log") { AuditView(api: api) }
            }
            Section("عمليات") {
                NavigationLink("تحويل") { TransferView(api: api) }
            }
            Section("الحساب") {
                NavigationLink("الإعدادات") { SettingsView(api: api) }
            }
            Section("قريباً") {
                NavigationLink("Cashflow") { ComingSoonView(title: "Cashflow") }
                NavigationLink("Profit & Loss") { ComingSoonView(title: "Profit & Loss") }
                NavigationLink("Real Estate") { ComingSoonView(title: "Real Estate") }
                NavigationLink("Emergency Fund") { ComingSoonView(title: "Emergency Fund") }
                NavigationLink("Currencies") { ComingSoonView(title: "Currencies") }
                NavigationLink("Smart Rules") { ComingSoonView(title: "Smart Rules") }
                NavigationLink("Reconciliation") { ComingSoonView(title: "Reconciliation") }
                NavigationLink("Installments") { ComingSoonView(title: "Installments") }
                NavigationLink("Onboarding") { ComingSoonView(title: "Onboarding") }
            }
        }
        .scrollContentBackground(.hidden)
        .background(FHTheme.bgPrimary)
        .navigationTitle("المزيد")
    }
}
