import SwiftUI
import FinanceHubCore
import FinanceHubUI

struct InvoicesView: View {
    let api: APIClient
    @State private var invoices: [Invoice] = []
    @State private var isLoading = true
    @State private var error: String?

    var body: some View {
        Group {
            if isLoading { ProgressView() }
            else if let error { Text(error).foregroundStyle(FHTheme.danger) }
            else {
                List(invoices) { inv in
                    HStack {
                        VStack(alignment: .leading) {
                            Text(inv.number ?? "فاتورة #\(inv.id)").foregroundStyle(FHTheme.textPrimary)
                            Text(inv.status ?? "").font(.caption).foregroundStyle(FHTheme.textMuted)
                        }
                        Spacer()
                        Text(Money.format(inv.total ?? 0)).foregroundStyle(FHTheme.textSecondary)
                    }
                    .listRowBackground(FHTheme.bgCard)
                }
                .scrollContentBackground(.hidden)
            }
        }
        .background(FHTheme.bgPrimary)
        .navigationTitle("الفواتير (Invoices)")
        .task {
            isLoading = true; error = nil; defer { isLoading = false }
            do {
                let r: InvoicesResponse = try await api.request("invoices")
                invoices = r.invoices
            } catch { self.error = error.localizedDescription }
        }
    }
}
