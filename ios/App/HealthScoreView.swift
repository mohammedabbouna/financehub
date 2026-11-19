import SwiftUI
import FinanceHubCore
import FinanceHubUI

struct HealthScoreView: View {
    let api: APIClient
    @State private var score: HealthScore?
    @State private var isLoading = true
    @State private var error: String?

    var body: some View {
        Group {
            if isLoading { ProgressView() }
            else if let error { Text(error).foregroundStyle(FHTheme.danger) }
            else if let s = score {
                ScrollView {
                    VStack(alignment: .leading, spacing: 16) {
                        Text("الصحة المالية").font(.title.bold()).foregroundStyle(FHTheme.textPrimary)
                        Text("\(Int(s.score)) / 100").font(.largeTitle.bold()).foregroundStyle(FHTheme.accent)
                        ForEach(s.breakdown.keys.sorted(), id: \.self) { key in
                            if let item = s.breakdown[key] {
                                HStack {
                                    Text(item.label).foregroundStyle(FHTheme.textPrimary)
                                    Spacer()
                                    Text("\(Int(item.score))").foregroundStyle(FHTheme.textSecondary)
                                }
                                .padding(.vertical, 4)
                            }
                        }
                    }
                    .padding()
                }
            }
        }
        .background(FHTheme.bgPrimary)
        .navigationTitle("Health Score")
        .task {
            isLoading = true; error = nil; defer { isLoading = false }
            do { score = try await api.request("health-score") }
            catch { self.error = error.localizedDescription }
        }
    }
}
