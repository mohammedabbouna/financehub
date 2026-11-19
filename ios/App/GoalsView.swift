import SwiftUI
import FinanceHubCore
import FinanceHubUI

struct GoalsView: View {
    let api: APIClient
    @State private var goals: [Goal] = []
    @State private var isLoading = true
    @State private var error: String?
    @State private var showForm = false
    @State private var editing: Goal?

    var body: some View {
        Group {
            if isLoading {
                ProgressView()
            } else if let error {
                Text(error).foregroundStyle(FHTheme.danger)
            } else {
                List(goals) { g in
                    VStack(alignment: .leading, spacing: 6) {
                        HStack {
                            Text(g.icon).font(.title3)
                            Text(g.name).foregroundStyle(FHTheme.textPrimary)
                            Spacer()
                            Text("\(Int((g.progress ?? 0) * 100))%")
                                .font(.caption).foregroundStyle(FHTheme.textSecondary)
                        }
                        ProgressView(value: g.progress ?? (g.currentAmount / max(g.targetAmount, 1)))
                            .tint(FHTheme.accent)
                        Text("\(Money.format(g.currentAmount)) / \(Money.format(g.targetAmount))")
                            .font(.caption2).foregroundStyle(FHTheme.textMuted)
                    }
                    .listRowBackground(FHTheme.bgCard)
                    .swipeActions {
                        Button("تعديل") { editing = g; showForm = true }
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
            GoalFormView(api: api, goal: editing) { await load() }
        }
        .task { await load() }
    }

    private func load() async {
        isLoading = true
        error = nil
        defer { isLoading = false }
        do {
            let r: GoalsResponse = try await api.request("goals")
            goals = r.goals
        } catch {
            self.error = error.localizedDescription
        }
    }
}
