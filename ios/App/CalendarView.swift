import SwiftUI
import FinanceHubCore
import FinanceHubUI

struct CalendarView: View {
    let api: APIClient
    @State private var data: CalendarResponse?
    @State private var isLoading = true
    @State private var error: String?

    private var year: Int { Calendar.current.component(.year, from: Date()) }
    private var month: Int { Calendar.current.component(.month, from: Date()) }

    var body: some View {
        Group {
            if isLoading { ProgressView() }
            else if let error { Text(error).foregroundStyle(FHTheme.danger) }
            else if let d = data {
                List(d.days.filter { $0.hasEvents }) { day in
                    VStack(alignment: .leading, spacing: 6) {
                        HStack {
                            Text(day.date).foregroundStyle(FHTheme.textPrimary)
                            if day.isToday { Text("اليوم").font(.caption).foregroundStyle(FHTheme.accent) }
                            Spacer()
                            Text("دخل \(Money.format(day.totalIncome)) • مصروف \(Money.format(day.totalExpense))")
                                .font(.caption).foregroundStyle(FHTheme.textMuted)
                        }
                        ForEach(day.actions.indices, id: \.self) { i in
                            let a = day.actions[i]
                            Text("\(a.categoryIcon ?? "") \(a.description ?? a.type ?? "") \(Money.format(a.amount ?? 0))")
                                .font(.caption).foregroundStyle(FHTheme.textSecondary)
                        }
                        ForEach(day.bills.indices, id: \.self) { i in
                            let b = day.bills[i]
                            Text("فاتورة: \(b.name ?? "") \(Money.format(b.amount ?? 0))")
                                .font(.caption).foregroundStyle(FHTheme.warning)
                        }
                    }
                    .listRowBackground(FHTheme.bgCard)
                }
                .scrollContentBackground(.hidden)
            }
        }
        .background(FHTheme.bgPrimary)
        .navigationTitle("التقويم")
        .task { await load() }
    }

    private func load() async {
        isLoading = true; error = nil; defer { isLoading = false }
        do {
            data = try await api.request("calendar", query: ["month": "\(month)", "year": "\(year)"])
        } catch { self.error = error.localizedDescription }
    }
}
