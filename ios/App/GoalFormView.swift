import SwiftUI
import FinanceHubCore
import FinanceHubUI

struct GoalFormView: View {
    let api: APIClient
    let goal: Goal?
    let onSaved: () async -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var wallets: [Wallet] = []
    @State private var name = ""
    @State private var targetAmount = ""
    @State private var currentAmount = ""
    @State private var targetDate = Date()
    @State private var hasDate = false
    @State private var linkedWalletId: Int?
    @State private var icon = "target"
    @State private var color = "#3b82f6"
    @State private var isLoading = false
    @State private var error: String?

    var body: some View {
        NavigationStack {
            Form {
                Section("الهدف") {
                    TextField("الاسم", text: $name)
                    TextField("المبلغ المستهدف", text: $targetAmount).keyboardType(.decimalPad)
                    TextField("المبلغ الحالي", text: $currentAmount).keyboardType(.decimalPad)
                    Toggle("تاريخ مستهدف", isOn: $hasDate)
                    if hasDate { DatePicker("التاريخ", selection: $targetDate, displayedComponents: .date) }
                    Picker("المحفظة المرتبطة", selection: $linkedWalletId) {
                        Text("—").tag(Optional<Int>(nil))
                        ForEach(wallets) { w in Text(w.name).tag(Optional(w.id)) }
                    }
                    TextField("الأيقونة", text: $icon)
                    TextField("اللون (hex)", text: $color)
                }
                if let error { Text(error).foregroundStyle(FHTheme.danger) }
            }
            .scrollContentBackground(.hidden)
            .background(FHTheme.bgPrimary)
            .navigationTitle(goal == nil ? "هدف جديد" : "تعديل الهدف")
            .toolbar {
                ToolbarItem(placement: .topBarLeading) { Button("إلغاء") { dismiss() } }
                ToolbarItem(placement: .topBarTrailing) {
                    Button(isLoading ? "..." : "حفظ") { Task { await save() } }.disabled(isLoading)
                }
            }
            .task { await loadWallets() }
            .onAppear { populate() }
        }
    }

    private func loadWallets() async {
        do {
            let r: WalletsResponse = try await api.request("wallets")
            wallets = r.wallets
        } catch { self.error = error.localizedDescription }
    }

    private func populate() {
        if let g = goal {
            name = g.name
            targetAmount = String(g.targetAmount)
            currentAmount = String(g.currentAmount)
            if let d = Dates.parse(g.targetDate ?? "") { targetDate = d; hasDate = true }
            linkedWalletId = g.linkedWalletId
            icon = g.icon
            color = g.color
        }
    }

    private func save() async {
        isLoading = true; error = nil; defer { isLoading = false }
        let df = DateFormatter(); df.dateFormat = "yyyy-MM-dd"
        do {
            if let g = goal {
                struct Body: Encodable {
                    let name: String
                    let targetAmount: Double
                    let currentAmount: Double
                    let targetDate: String?
                    let linkedWalletId: Int?
                    let icon: String
                    let color: String
                }
                let _: GenericMessage? = try await api.request("goals/\(g.id)", method: "PUT", body: Body(name: name, targetAmount: Double(targetAmount) ?? 0, currentAmount: Double(currentAmount) ?? 0, targetDate: hasDate ? df.string(from: targetDate) : nil, linkedWalletId: linkedWalletId, icon: icon, color: color))
            } else {
                struct Body: Encodable {
                    let name: String
                    let targetAmount: Double
                    let currentAmount: Double
                    let targetDate: String?
                    let linkedWalletId: Int?
                    let icon: String
                    let color: String
                }
                let _: GenericMessage? = try await api.request("goals", method: "POST", body: Body(name: name, targetAmount: Double(targetAmount) ?? 0, currentAmount: Double(currentAmount) ?? 0, targetDate: hasDate ? df.string(from: targetDate) : nil, linkedWalletId: linkedWalletId, icon: icon, color: color))
            }
            await onSaved()
            dismiss()
        } catch {
            self.error = error.localizedDescription
        }
    }
}
