import SwiftUI
import FinanceHubCore
import FinanceHubUI

struct ActionFormView: View {
    let api: APIClient
    let action: Action?
    let onSaved: () async -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var wallets: [Wallet] = []
    @State private var categories: [FinanceHubCore.Category] = []
    @State private var type: ActionType = .deposit
    @State private var amount = ""
    @State private var walletId: Int?
    @State private var targetWalletId: Int?
    @State private var categoryId: Int?
    @State private var description = ""
    @State private var date = Date()
    @State private var tag = ""
    @State private var isLoading = false
    @State private var error: String?

    var body: some View {
        NavigationStack {
            Form {
                if action == nil {
                    Section("العملية") {
                        Picker("النوع", selection: $type) {
                            ForEach([ActionType.deposit, .withdraw, .transfer, .invest, .borrow, .repay], id: \.self) { t in
                                Text(t.rawValue).tag(t)
                            }
                        }
                        TextField("المبلغ", text: $amount).keyboardType(.decimalPad)
                        Picker("المحفظة", selection: $walletId) {
                            ForEach(wallets) { w in Text(w.name).tag(Optional(w.id)) }
                        }
                        if type == .transfer {
                            Picker("المحفظة الهدف", selection: $targetWalletId) {
                                ForEach(wallets) { w in Text(w.name).tag(Optional(w.id)) }
                            }
                        }
                    }
                }
                Section("التفاصيل") {
                    Picker("الفئة", selection: $categoryId) {
                        Text("—").tag(Optional<Int>(nil))
                        ForEach(categories) { c in Text(c.name).tag(Optional(c.id)) }
                    }
                    TextField("الوصف", text: $description)
                    DatePicker("التاريخ", selection: $date, displayedComponents: .date)
                    TextField("الوسم", text: $tag)
                }
                if let error { Text(error).foregroundStyle(FHTheme.danger) }
            }
            .scrollContentBackground(.hidden)
            .background(FHTheme.bgPrimary)
            .navigationTitle(action == nil ? "عملية جديدة" : "تعديل العملية")
            .toolbar {
                ToolbarItem(placement: .topBarLeading) { Button("إلغاء") { dismiss() } }
                ToolbarItem(placement: .topBarTrailing) {
                    Button(isLoading ? "..." : "حفظ") { Task { await save() } }.disabled(isLoading)
                }
            }
            .task { await loadMeta() }
            .onAppear { populate() }
        }
    }

    private func loadMeta() async {
        do {
            let wr: WalletsResponse = try await api.request("wallets")
            wallets = wr.wallets
            if walletId == nil { walletId = wallets.first?.id }
            if targetWalletId == nil { targetWalletId = wallets.dropFirst().first?.id }
            let cr: CategoriesResponse = try await api.request("categories")
            categories = cr.categories
        } catch { self.error = error.localizedDescription }
    }

    private func populate() {
        if let a = action {
            categoryId = a.categoryId
            description = a.description
            tag = a.tag ?? ""
            if let d = Dates.parse(a.date) { date = d }
        }
    }

    private func save() async {
        isLoading = true; error = nil; defer { isLoading = false }
        let df = DateFormatter(); df.dateFormat = "yyyy-MM-dd"
        let dateStr = df.string(from: date)
        do {
            if let a = action {
                struct Body: Encodable {
                    let categoryId: Int?
                    let description: String
                    let date: String
                    let tag: String?
                }
                let _: GenericMessage? = try await api.request("actions/\(a.id)", method: "PUT", body: Body(categoryId: categoryId, description: description, date: dateStr, tag: tag.isEmpty ? nil : tag))
            } else {
                guard let w = walletId, let amt = Double(amount) else { return }
                struct Body: Encodable {
                    let type: String
                    let amount: Double
                    let walletId: Int
                    let targetWalletId: Int?
                    let categoryId: Int?
                    let description: String
                    let date: String
                    let tag: String?
                }
                let _: GenericMessage? = try await api.request("actions", method: "POST", body: Body(type: type.rawValue, amount: amt, walletId: w, targetWalletId: type == .transfer ? targetWalletId : nil, categoryId: categoryId, description: description, date: dateStr, tag: tag.isEmpty ? nil : tag))
            }
            await onSaved()
            dismiss()
        } catch {
            self.error = error.localizedDescription
        }
    }
}
