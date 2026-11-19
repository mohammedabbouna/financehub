import SwiftUI
import FinanceHubCore
import FinanceHubUI

struct BudgetsView: View {
    let api: APIClient
    @State private var budgets: [Budget] = []
    @State private var isLoading = true
    @State private var error: String?
    @State private var showForm = false
    @State private var editing: Budget?

    var body: some View {
        Group {
            if isLoading {
                ProgressView()
            } else if let error {
                Text(error).foregroundStyle(FHTheme.danger)
            } else {
                List(budgets) { b in
                    VStack(alignment: .leading, spacing: 6) {
                        HStack {
                            Text(b.categoryIcon).font(.title3)
                            Text(b.categoryName).foregroundStyle(FHTheme.textPrimary)
                            Spacer()
                            Text("\(Money.format(b.spent)) / \(Money.format(b.amount))")
                                .font(.caption).foregroundStyle(FHTheme.textSecondary)
                        }
                        ProgressView(value: min(b.spent / max(b.amount, 1), 1))
                            .tint(b.spent > b.amount ? FHTheme.danger : FHTheme.accent)
                    }
                    .listRowBackground(FHTheme.bgCard)
                    .swipeActions {
                        Button("تعديل") { editing = b; showForm = true }
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
            BudgetFormView(api: api, budget: editing) { await load() }
        }
        .task { await load() }
    }

    private func load() async {
        isLoading = true
        error = nil
        defer { isLoading = false }
        do {
            let r: BudgetsResponse = try await api.request("budgets")
            budgets = r.budgets
        } catch {
            self.error = error.localizedDescription
        }
    }
}
