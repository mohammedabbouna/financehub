import SwiftUI
import FinanceHubCore
import FinanceHubUI

struct InvestmentsView: View {
    let api: APIClient
    @State private var investments: [Investment] = []
    @State private var isLoading = true
    @State private var error: String?

    var body: some View {
        Group {
            if isLoading { ProgressView() }
            else if let error { Text(error).foregroundStyle(FHTheme.danger) }
            else {
                List(investments) { i in
                    VStack(alignment: .leading, spacing: 4) {
                        HStack {
                            Text(i.name).foregroundStyle(FHTheme.textPrimary)
                            Spacer()
                            Text(Money.format(i.currentValue)).foregroundStyle(FHTheme.textSecondary)
                        }
                        Text("\(i.assetType.rawValue) • \(i.quantity, specifier: "%.4f") @ \(Money.format(i.currentPrice))")
                            .font(.caption).foregroundStyle(FHTheme.textMuted)
                    }
                    .listRowBackground(FHTheme.bgCard)
                }
                .scrollContentBackground(.hidden)
            }
        }
        .background(FHTheme.bgPrimary)
        .navigationTitle("الاستثمارات")
        .task {
            isLoading = true; error = nil; defer { isLoading = false }
            do {
                let r: InvestmentsResponse = try await api.request("investments")
                investments = r.investments
            } catch { self.error = error.localizedDescription }
        }
    }
}
