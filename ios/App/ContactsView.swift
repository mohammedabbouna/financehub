import SwiftUI
import FinanceHubCore
import FinanceHubUI

struct ContactsView: View {
    let api: APIClient
    @State private var contacts: [Contact] = []
    @State private var isLoading = true
    @State private var error: String?

    var body: some View {
        Group {
            if isLoading { ProgressView() }
            else if let error { Text(error).foregroundStyle(FHTheme.danger) }
            else {
                List(contacts) { c in
                    HStack {
                        Text(c.name).foregroundStyle(FHTheme.textPrimary)
                        Spacer()
                        VStack(alignment: .trailing) {
                            Text("أقرضت: \(Money.format(c.totalLent))").font(.caption).foregroundStyle(FHTheme.success)
                            Text("استلفت: \(Money.format(c.totalBorrowed))").font(.caption).foregroundStyle(FHTheme.danger)
                        }
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
                let r: ContactsResponse = try await api.request("contacts")
                contacts = r.contacts
            } catch { self.error = error.localizedDescription }
        }
    }
}
