import SwiftUI
import FinanceHubCore
import FinanceHubUI

struct InsightsView: View {
    let api: APIClient
    @State private var insights: [Insight] = []
    @State private var isLoading = true
    @State private var error: String?

    var body: some View {
        Group {
            if isLoading { ProgressView() }
            else if let error { Text(error).foregroundStyle(FHTheme.danger) }
            else {
                List(insights) { i in
                    VStack(alignment: .leading, spacing: 4) {
                        Text(i.type).font(.caption).foregroundStyle(FHTheme.accent)
                        Text(i.message).foregroundStyle(FHTheme.textPrimary)
                    }
                    .listRowBackground(FHTheme.bgCard)
                }
                .scrollContentBackground(.hidden)
            }
        }
        .background(FHTheme.bgPrimary)
        .navigationTitle("الرؤى")
        .task {
            isLoading = true; error = nil; defer { isLoading = false }
            do {
                let r: InsightsResponse = try await api.request("insights")
                insights = r.insights
            } catch { self.error = error.localizedDescription }
        }
    }
}
