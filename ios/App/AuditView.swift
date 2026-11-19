import SwiftUI
import FinanceHubCore
import FinanceHubUI

struct AuditView: View {
    let api: APIClient
    @State private var logs: [[String: JSONValue]] = []
    @State private var isLoading = true
    @State private var error: String?

    var body: some View {
        Group {
            if isLoading { ProgressView() }
            else if let error { Text(error).foregroundStyle(FHTheme.danger) }
            else {
                List(logs.indices, id: \.self) { i in
                    let log = logs[i]
                    VStack(alignment: .leading, spacing: 4) {
                        Text(log["action"]?.stringValue ?? "action").foregroundStyle(FHTheme.textPrimary)
                        Text(log["created_at"]?.stringValue ?? "").font(.caption).foregroundStyle(FHTheme.textMuted)
                    }
                    .listRowBackground(FHTheme.bgCard)
                }
                .scrollContentBackground(.hidden)
            }
        }
        .background(FHTheme.bgPrimary)
        .navigationTitle("Audit Log")
        .task {
            isLoading = true; error = nil; defer { isLoading = false }
            do {
                let r: AuditLogsResponse = try await api.request("audit")
                logs = r.logs
            } catch { self.error = error.localizedDescription }
        }
    }
}

extension JSONValue {
    var stringValue: String? {
        if case .string(let s) = self { return s }
        return nil
    }
}
