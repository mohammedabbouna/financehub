import SwiftUI
import FinanceHubCore
import FinanceHubUI

struct GoldView: View {
    let api: APIClient
    @State private var price: GoldPrice?
    @State private var holdings: GoldHoldingsResponse?
    @State private var isLoading = true
    @State private var error: String?

    var body: some View {
        Group {
            if isLoading { ProgressView() }
            else if let error { Text(error).foregroundStyle(FHTheme.danger) }
            else {
                ScrollView {
                    VStack(alignment: .leading, spacing: 16) {
                        Text("الذهب").font(.title.bold()).foregroundStyle(FHTheme.textPrimary)
                        if let price {
                            card("السعر") {
                                row("دولار/أونصة", price.priceUsdOz)
                                row("دولار/دج", price.usdDzd)
                                row("دج/غرام", price.priceDzdGram)
                                Text(price.isStale ? "قديم" : "محدّث").font(.caption).foregroundStyle(price.isStale ? FHTheme.warning : FHTheme.success)
                            }
                        }
                        if let h = holdings {
                            card("الحيازات") {
                                Text("إجمالي الغرامات: \(h.summary.totalGrams, specifier: "%.2f")").foregroundStyle(FHTheme.textPrimary)
                                Text("القيمة: \(Money.format(h.summary.totalValue))").foregroundStyle(FHTheme.textSecondary)
                                Text("الربح/الخسارة: \(Money.format(h.summary.pnl))").foregroundStyle(h.summary.pnl >= 0 ? FHTheme.success : FHTheme.danger)
                            }
                            card("خطة الادخار (85غ)") {
                                Text("المفقود: \(h.plan.missingGrams, specifier: "%.2f") غ").foregroundStyle(FHTheme.textPrimary)
                                if let per = h.plan.perMonth { Text("شهرياً: \(Money.format(per))").foregroundStyle(FHTheme.textSecondary) }
                            }
                        }
                    }
                    .padding()
                }
            }
        }
        .background(FHTheme.bgPrimary)
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
            Text(String(format: "%.2f", value)).foregroundStyle(FHTheme.textSecondary)
        }
    }

    private func load() async {
        isLoading = true; error = nil; defer { isLoading = false }
        do {
            price = try await api.request("gold/price")
            holdings = try await api.request("gold/holdings")
        } catch { self.error = error.localizedDescription }
    }
}
