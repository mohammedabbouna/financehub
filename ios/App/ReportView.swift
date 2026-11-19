import SwiftUI
import FinanceHubCore
import FinanceHubUI

extension MonthlyReportCategory: Identifiable {}

struct ReportView: View {
    let api: APIClient
    @State private var report: MonthlyReport?
    @State private var isLoading = true
    @State private var error: String?

    private var now: Date { Date() }
    private var year: Int { Calendar.current.component(.year, from: now) }
    private var month: Int { Calendar.current.component(.month, from: now) }

    var body: some View {
        Group {
            if isLoading { ProgressView() }
            else if let error { Text(error).foregroundStyle(FHTheme.danger) }
            else if let r = report {
                ScrollView {
                    VStack(alignment: .leading, spacing: 16) {
                        Text(r.periodLabel).font(.title.bold()).foregroundStyle(FHTheme.textPrimary)
                        card("الملخص") {
                            row("الدخل", r.summary.income)
                            row("المصروف", r.summary.expenses)
                            row("الصافي", r.summary.net)
                            row("معدل الادخار", r.summary.savingsRate)
                            Text("العمليات: \(r.summary.transactions)").foregroundStyle(FHTheme.textSecondary)
                        }
                        card("السرد") {
                            Text(r.narrative).foregroundStyle(FHTheme.textPrimary)
                        }
                        if !r.recommendations.isEmpty {
                            card("توصيات") {
                                ForEach(r.recommendations, id: \.self) { rec in
                                    Text("• \(rec)").foregroundStyle(FHTheme.textPrimary)
                                }
                            }
                        }
                        if !r.categories.isEmpty {
                            card("الفئات") {
                                ForEach(r.categories) { c in
                                    HStack {
                                        Text(c.icon)
                                        Text(c.name).foregroundStyle(FHTheme.textPrimary)
                                        Spacer()
                                        Text(Money.format(c.total)).foregroundStyle(FHTheme.textSecondary)
                                    }
                                }
                            }
                        }
                    }
                    .padding()
                }
            }
        }
        .background(FHTheme.bgPrimary)
        .navigationTitle("التقرير الشهري")
        .task { await load() }
    }

    private func card(_ title: String, @ViewBuilder content: () -> some View) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(title).font(.headline).foregroundStyle(FHTheme.textSecondary)
            content()
        }
        .padding()
        .frame(maxWidth: .infinity, alignment: .leading)
        .fhCard()
    }

    private func row(_ label: String, _ value: Double) -> some View {
        HStack {
            Text(label).foregroundStyle(FHTheme.textPrimary)
            Spacer()
            Text(Money.format(value)).foregroundStyle(FHTheme.textSecondary)
        }
    }

    private func load() async {
        isLoading = true; error = nil; defer { isLoading = false }
        do {
            struct Resp: Decodable { let report: MonthlyReport }
            let r: Resp = try await api.request("reports/\(year)/\(month)")
            report = r.report
        } catch { self.error = error.localizedDescription }
    }
}
