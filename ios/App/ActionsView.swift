import SwiftUI
import FinanceHubCore
import FinanceHubUI

struct ActionsView: View {
    let api: APIClient
    @State private var actions: [Action] = []
    @State private var isLoading = true
    @State private var error: String?
    @State private var showForm = false
    @State private var editing: Action?

    var body: some View {
        Group {
            if isLoading {
                ProgressView()
            } else if let error {
                Text(error).foregroundStyle(FHTheme.danger)
            } else {
                List(actions) { a in
                    HStack {
                        VStack(alignment: .leading) {
                            Text(a.description.isEmpty ? a.type.rawValue : a.description)
                                .foregroundStyle(FHTheme.textPrimary)
                            Text(a.date).font(.caption).foregroundStyle(FHTheme.textMuted)
                        }
                        Spacer()
                        Text(Money.format(a.amount))
                            .font(.system(.body, design: .monospaced))
                            .foregroundStyle(a.type == .deposit ? FHTheme.success : FHTheme.danger)
                    }
                    .listRowBackground(FHTheme.bgCard)
                    .swipeActions {
                        Button("تعديل") { editing = a; showForm = true }
                    }
                }
                .scrollContentBackground(.hidden)
            }
        }
        .background(FHTheme.bgPrimary)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button { editing = nil; showForm = true } label: { Image(systemName: "plus") }
            }
        }
        .sheet(isPresented: $showForm) {
            ActionFormView(api: api, action: editing) { await load() }
        }
        .task { await load() }
    }

    private func load() async {
        isLoading = true
        error = nil
        defer { isLoading = false }
        do {
            let r: ActionsResponse = try await api.request("actions")
            actions = r.actions
        } catch {
            self.error = error.localizedDescription
        }
    }
}
