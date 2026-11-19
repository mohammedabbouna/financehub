import SwiftUI
import FinanceHubCore
import FinanceHubUI

struct ClientsView: View {
    let api: APIClient
    @State private var clients: [Client] = []
    @State private var isLoading = true
    @State private var error: String?

    var body: some View {
        Group {
            if isLoading { ProgressView() }
            else if let error { Text(error).foregroundStyle(FHTheme.danger) }
            else {
                List(clients) { c in
                    VStack(alignment: .leading) {
                        Text(c.name).foregroundStyle(FHTheme.textPrimary)
                        if let email = c.email { Text(email).font(.caption).foregroundStyle(FHTheme.textMuted) }
                    }
                    .listRowBackground(FHTheme.bgCard)
                }
                .scrollContentBackground(.hidden)
            }
        }
        .background(FHTheme.bgPrimary)
        .navigationTitle("العملاء")
        .task {
            isLoading = true; error = nil; defer { isLoading = false }
            do {
                let r: ClientsResponse = try await api.request("clients")
                clients = r.clients
            } catch { self.error = error.localizedDescription }
        }
    }
}
