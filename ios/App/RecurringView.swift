import SwiftUI
import FinanceHubCore
import FinanceHubUI

struct RecurringView: View {
    let api: APIClient
    @State private var items: [RecurringTransaction] = []
    @State private var isLoading = true
    @State private var error: String?

    var body: some View {
        Group {
            if isLoading { ProgressView() }
            else if let error { Text(error).foregroundStyle(FHTheme.danger) }
            else {
                List(items) { r in
                    HStack {
                        VStack(alignment: .leading) {
                            Text(r.name).foregroundStyle(FHTheme.textPrimary)
                            Text("\(r.frequency.rawValue) • next \(r.nextRunDate)")
                                .font(.caption).foregroundStyle(FHTheme.textMuted)
                        }
                        Spacer()
                        Text(r.isActive ? "نشط" : "متوقف")
                            .font(.caption)
                            .foregroundStyle(r.isActive ? FHTheme.success : FHTheme.textMuted)
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
                let r: RecurringResponse = try await api.request("recurring")
                items = r.recurring
            } catch { self.error = error.localizedDescription }
        }
    }
}
