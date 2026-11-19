import SwiftUI
import FinanceHubCore
import FinanceHubUI

struct TransferView: View {
    let api: APIClient
    @State private var wallets: [Wallet] = []
    @State private var fromId: Int?
    @State private var toId: Int?
    @State private var amount = ""
    @State private var description = ""
    @State private var isLoading = false
    @State private var error: String?
    @State private var success = false

    var body: some View {
        Form {
            Section("التحويل") {
                Picker("من", selection: $fromId) {
                    ForEach(wallets) { w in Text(w.name).tag(Optional(w.id)) }
                }
                Picker("إلى", selection: $toId) {
                    ForEach(wallets) { w in Text(w.name).tag(Optional(w.id)) }
                }
                TextField("المبلغ", text: $amount).keyboardType(.decimalPad)
                TextField("الوصف (اختياري)", text: $description)
            }
            if let error { Text(error).foregroundStyle(FHTheme.danger) }
            if success { Text("تم التحويل").foregroundStyle(FHTheme.success) }
            Button(isLoading ? "جارٍ..." : "تحويل") { Task { await submit() } }
                .disabled(isLoading || fromId == nil || toId == nil || fromId == toId)
        }
        .scrollContentBackground(.hidden)
        .background(FHTheme.bgPrimary)
        .navigationTitle("تحويل")
        .task { await loadWallets() }
    }

    private func loadWallets() async {
        do {
            let r: WalletsResponse = try await api.request("wallets")
            wallets = r.wallets
            if fromId == nil { fromId = wallets.first?.id }
            if toId == nil { toId = wallets.dropFirst().first?.id ?? wallets.first?.id }
        } catch { self.error = error.localizedDescription }
    }

    private func submit() async {
        guard let from = fromId, let to = toId, let amt = Double(amount) else { return }
        isLoading = true; error = nil; success = false; defer { isLoading = false }
        do {
            struct Body: Encodable {
                let fromWalletId: Int
                let toWalletId: Int
                let amount: Double
                let description: String?
            }
            let _: GenericMessage? = try await api.request("transfers", method: "POST", body: Body(fromWalletId: from, toWalletId: to, amount: amt, description: description.isEmpty ? nil : description))
            success = true
            amount = ""
            description = ""
        } catch { self.error = error.localizedDescription }
    }
}
