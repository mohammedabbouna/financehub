import SwiftUI
import FinanceHubCore
import FinanceHubUI

struct NotificationsView: View {
    let api: APIClient
    @State private var notifications: [AppNotification] = []
    @State private var isLoading = true
    @State private var error: String?

    var body: some View {
        Group {
            if isLoading { ProgressView() }
            else if let error { Text(error).foregroundStyle(FHTheme.danger) }
            else {
                List(notifications) { n in
                    VStack(alignment: .leading, spacing: 4) {
                        Text(n.title).foregroundStyle(FHTheme.textPrimary)
                        Text(n.body).font(.caption).foregroundStyle(FHTheme.textSecondary)
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
                let r: NotificationsResponse = try await api.request("notifications")
                notifications = r.notifications
            } catch { self.error = error.localizedDescription }
        }
    }
}
