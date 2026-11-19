import SwiftUI
import SwiftData
import FinanceHubCore
import FinanceHubUI

struct WalletsView: View {
    let api: APIClient
    @Environment(\.modelContext) private var modelContext
    @State private var wallets: [Wallet] = []
    @State private var isLoading = true
    @State private var error: String?
    @State private var showForm = false
    @State private var editing: Wallet?

    var body: some View {
        Group {
            if isLoading {
                ProgressView()
            } else if let error {
                Text(error).foregroundStyle(FHTheme.danger)
            } else {
                List(wallets) { w in
                    HStack {
                        VStack(alignment: .leading) {
                            Text(w.name).foregroundStyle(FHTheme.textPrimary)
                            Text(w.type.rawValue).font(.caption).foregroundStyle(FHTheme.textMuted)
                        }
                        Spacer()
                        Text(Money.format(w.balance, currency: w.currency))
                            .font(.system(.body, design: .monospaced))
                            .foregroundStyle(FHTheme.textPrimary)
                    }
                    .listRowBackground(FHTheme.bgCard)
                    .swipeActions {
                        Button("تعديل") { editing = w; showForm = true }
                        Button("أرشفة", role: .destructive) { Task { await archive(w) } }
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
            WalletFormView(api: api, wallet: editing) { await load() }
        }
        .task { await load() }
    }

    private func archive(_ w: Wallet) async {
        do {
            let _: GenericMessage? = try await api.request("wallets/\(w.id)/archive", method: "PATCH")
            await load()
        } catch {
            self.error = error.localizedDescription
        }
    }

    private func load() async {
        isLoading = true
        error = nil
        defer { isLoading = false }
        do {
            let r: WalletsResponse = try await api.request("wallets")
            wallets = r.wallets
            for w in r.wallets {
                modelContext.insert(CachedWallet(from: w))
            }
            try? modelContext.save()
        } catch {
            self.error = error.localizedDescription
            let descriptor = FetchDescriptor<CachedWallet>(sortBy: [SortDescriptor(\.name)])
            if let cached = try? modelContext.fetch(descriptor) {
                wallets = cached.map { Wallet(id: $0.id, userId: 0, name: $0.name, type: WalletType(rawValue: $0.type) ?? .cash, currency: $0.currency, balance: $0.balance, icon: $0.icon, color: $0.color, isArchived: $0.isArchived, createdAt: "") }
            }
        }
    }
}
