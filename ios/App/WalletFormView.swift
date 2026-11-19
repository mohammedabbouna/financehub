import SwiftUI
import FinanceHubCore
import FinanceHubUI

struct WalletFormView: View {
    let api: APIClient
    let wallet: Wallet?
    let onSaved: () async -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var name = ""
    @State private var type: WalletType = .cash
    @State private var currency = "DZD"
    @State private var balance = ""
    @State private var icon = "wallet"
    @State private var color = "#3b82f6"
    @State private var isLoading = false
    @State private var error: String?

    var body: some View {
        NavigationStack {
            Form {
                Section("المحفظة") {
                    TextField("الاسم", text: $name)
                    Picker("النوع", selection: $type) {
                        ForEach([WalletType.cash, .bank, .savings, .investment, .emergency], id: \.self) { t in
                            Text(t.rawValue).tag(t)
                        }
                    }
                    TextField("العملة", text: $currency)
                    TextField("الرصيد", text: $balance).keyboardType(.decimalPad)
                    TextField("الأيقونة", text: $icon)
                    TextField("اللون (hex)", text: $color)
                }
                if let error { Text(error).foregroundStyle(FHTheme.danger) }
            }
            .scrollContentBackground(.hidden)
            .background(FHTheme.bgPrimary)
            .navigationTitle(wallet == nil ? "محفظة جديدة" : "تعديل المحفظة")
            .onAppear {
                if let w = wallet {
                    name = w.name
                    type = w.type
                    currency = w.currency
                    balance = String(w.balance)
                    icon = w.icon
                    color = w.color
                }
            }
            .toolbar {
                ToolbarItem(placement: .topBarLeading) { Button("إلغاء") { dismiss() } }
                ToolbarItem(placement: .topBarTrailing) {
                    Button(isLoading ? "..." : "حفظ") { Task { await save() } }.disabled(isLoading)
                }
            }
        }
    }

    private func save() async {
        isLoading = true; error = nil; defer { isLoading = false }
        let bal = Double(balance) ?? 0
        do {
            if let w = wallet {
                struct Body: Encodable {
                    let name: String; let type: String; let currency: String; let icon: String; let color: String; let balance: Double
                }
                let _: GenericMessage? = try await api.request("wallets/\(w.id)", method: "PUT", body: Body(name: name, type: type.rawValue, currency: currency, icon: icon, color: color, balance: bal))
            } else {
                struct Body: Encodable {
                    let name: String; let type: String; let currency: String; let balance: Double; let icon: String; let color: String
                }
                let _: GenericMessage? = try await api.request("wallets", method: "POST", body: Body(name: name, type: type.rawValue, currency: currency, balance: bal, icon: icon, color: color))
            }
            await onSaved()
            dismiss()
        } catch {
            self.error = error.localizedDescription
        }
    }
}
