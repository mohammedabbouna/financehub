import SwiftUI
import FinanceHubCore
import FinanceHubUI

struct DebtsView: View {
    let api: APIClient
    @State private var debts: [Debt] = []
    @State private var isLoading = true
    @State private var error: String?

    var body: some View {
        Group {
            if isLoading { ProgressView() }
            else if let error { Text(error).foregroundStyle(FHTheme.danger) }
            else {
                List(debts) { d in
                    VStack(alignment: .leading, spacing: 4) {
                        HStack {
                            Text(d.contactName).foregroundStyle(FHTheme.textPrimary)
                            Spacer()
                            Text(Money.format(d.remaining))
                                .font(.system(.body, design: .monospaced))
                                .foregroundStyle(d.direction == .lentTo ? FHTheme.success : FHTheme.danger)
                        }
                        Text(d.status.rawValue).font(.caption).foregroundStyle(FHTheme.textMuted)
                    }
                    .listRowBackground(FHTheme.bgCard)
                }
                .scrollContentBackground(.hidden)
            }
        }
        .background(FHTheme.bgPrimary)
        .task {
            isLoading = true; error = nil; defer { isLoading = false }
            do {
                let r: DebtsResponse = try await api.request("debts")
                debts = r.debts
            } catch { self.error = error.localizedDescription }
        }
    }
}
