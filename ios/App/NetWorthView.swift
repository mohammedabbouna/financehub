import SwiftUI
import Charts
import FinanceHubCore
import FinanceHubUI

struct NetWorthView: View {
    let api: APIClient
    @State private var data: NetWorth?
    @State private var isLoading = true
    @State private var error: String?

    var body: some View {
        Group {
            if isLoading { ProgressView() }
            else if let error { Text(error).foregroundStyle(FHTheme.danger) }
            else if let d = data {
                ScrollView {
                    VStack(alignment: .leading, spacing: 16) {
                        Text("صافي الثروة").font(.title.bold()).foregroundStyle(FHTheme.textPrimary)
                        card("الملخص") {
                            row("الحالي", d.current)
                            row("البداية", d.start)
                            row("النهاية", d.end)
                            row("التغيير", d.change)
                            if let p = d.changePercent { Text("النسبة: \(p, specifier: "%.1f")%").foregroundStyle(FHTheme.textSecondary) }
                        }
                        card("المنحنى") {
                            Chart(d.points) { p in
                                AreaMark(x: .value("Date", p.date), y: .value("Balance", p.balance))
                                    .foregroundStyle(FHTheme.accent.opacity(0.2))
                                LineMark(x: .value("Date", p.date), y: .value("Balance", p.balance))
                                    .foregroundStyle(FHTheme.accent)
                            }
                            .frame(height: 220)
                        }
                    }
                    .padding()
                }
            }
        }
        .background(FHTheme.bgPrimary)
        .navigationTitle("صافي الثروة")
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
        do { data = try await api.request("networth") }
        catch { self.error = error.localizedDescription }
    }
}

extension NetWorthPoint: Identifiable {
    public var id: String { date }
}
