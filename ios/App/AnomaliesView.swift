import SwiftUI
import FinanceHubCore
import FinanceHubUI

struct AnomaliesView: View {
    let api: APIClient
    @State private var anomalies: [Anomaly] = []
    @State private var isLoading = true
    @State private var error: String?

    var body: some View {
        Group {
            if isLoading { ProgressView() }
            else if let error { Text(error).foregroundStyle(FHTheme.danger) }
            else {
                List(anomalies) { a in
                    VStack(alignment: .leading, spacing: 4) {
                        Text(a.reason).foregroundStyle(FHTheme.textPrimary)
                        Text(a.severity.rawValue).font(.caption).foregroundStyle(FHTheme.warning)
                    }
                    .listRowBackground(FHTheme.bgCard)
                }
                .scrollContentBackground(.hidden)
            }
        }
        .background(FHTheme.bgPrimary)
        .navigationTitle("الشذوذ")
        .task {
            isLoading = true; error = nil; defer { isLoading = false }
            do {
                let r: AnomaliesResponse = try await api.request("anomalies")
                anomalies = r.anomalies
            } catch { self.error = error.localizedDescription }
        }
    }
}
