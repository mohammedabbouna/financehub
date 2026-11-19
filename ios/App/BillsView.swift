import SwiftUI
import FinanceHubCore
import FinanceHubUI

struct BillsView: View {
    let api: APIClient
    @State private var bills: [Bill] = []
    @State private var isLoading = true
    @State private var error: String?

    var body: some View {
        Group {
            if isLoading { ProgressView() }
            else if let error { Text(error).foregroundStyle(FHTheme.danger) }
            else {
                List(bills) { b in
                    HStack {
                        VStack(alignment: .leading) {
                            Text(b.name).foregroundStyle(FHTheme.textPrimary)
                            Text(b.dueDate).font(.caption).foregroundStyle(FHTheme.textMuted)
                        }
                        Spacer()
                        Text(Money.format(b.amount)).foregroundStyle(FHTheme.textSecondary)
                        Text(b.isPaid ? "مدفوع" : "غير مدفوع").font(.caption)
                            .foregroundStyle(b.isPaid ? FHTheme.success : FHTheme.warning)
                    }
                    .listRowBackground(FHTheme.bgCard)
                }
                .scrollContentBackground(.hidden)
            }
        }
        .background(FHTheme.bgPrimary)
        .navigationTitle("الفواتير")
        .task {
            isLoading = true; error = nil; defer { isLoading = false }
            do {
                let r: BillsResponse = try await api.request("bills")
                bills = r.bills
            } catch { self.error = error.localizedDescription }
        }
    }
}
