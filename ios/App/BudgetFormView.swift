import SwiftUI
import FinanceHubCore
import FinanceHubUI

struct BudgetFormView: View {
    let api: APIClient
    let budget: Budget?
    let onSaved: () async -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var categories: [FinanceHubCore.Category] = []
    @State private var categoryId: Int?
    @State private var period: BudgetPeriod = .monthly
    @State private var amount = ""
    @State private var isPercentage = false
    @State private var isActive = true
    @State private var isLoading = false
    @State private var error: String?

    var body: some View {
        NavigationStack {
            Form {
                Section("الميزانية") {
                    Picker("الفئة", selection: $categoryId) {
                        ForEach(categories) { c in Text(c.name).tag(Optional(c.id)) }
                    }
                    Picker("الفترة", selection: $period) {
                        Text("أسبوعية").tag(BudgetPeriod.weekly)
                        Text("شهرية").tag(BudgetPeriod.monthly)
                        Text("سنوية").tag(BudgetPeriod.yearly)
                    }
                    TextField("المبلغ", text: $amount).keyboardType(.decimalPad)
                    Toggle("نسبة مئوية", isOn: $isPercentage)
                    Toggle("نشط", isOn: $isActive)
                }
                if let error { Text(error).foregroundStyle(FHTheme.danger) }
            }
            .scrollContentBackground(.hidden)
            .background(FHTheme.bgPrimary)
            .navigationTitle(budget == nil ? "ميزانية جديدة" : "تعديل الميزانية")
            .toolbar {
                ToolbarItem(placement: .topBarLeading) { Button("إلغاء") { dismiss() } }
                ToolbarItem(placement: .topBarTrailing) {
                    Button(isLoading ? "..." : "حفظ") { Task { await save() } }.disabled(isLoading || categoryId == nil)
                }
            }
            .task { await loadCategories() }
            .onAppear { populate() }
        }
    }

    private func loadCategories() async {
        do {
            let r: CategoriesResponse = try await api.request("categories")
            categories = r.categories.filter { $0.type == .expense }
            if categoryId == nil { categoryId = categories.first?.id }
        } catch { self.error = error.localizedDescription }
    }

    private func populate() {
        if let b = budget {
            categoryId = b.categoryId
            period = b.period
            amount = String(b.amount)
            isPercentage = b.isPercentage
            isActive = b.isActive
        }
    }

    private func save() async {
        isLoading = true; error = nil; defer { isLoading = false }
        guard let cid = categoryId, let amt = Double(amount) else { return }
        do {
            if let b = budget {
                struct Body: Encodable {
                    let amount: Double
                    let period: String
                    let isPercentage: Bool
                    let isActive: Bool
                }
                let _: GenericMessage? = try await api.request("budgets/\(b.id)", method: "PUT", body: Body(amount: amt, period: period.rawValue, isPercentage: isPercentage, isActive: isActive))
            } else {
                struct Body: Encodable {
                    let categoryId: Int
                    let period: String
                    let amount: Double
                    let isPercentage: Bool
                    let isActive: Bool
                }
                let _: GenericMessage? = try await api.request("budgets", method: "POST", body: Body(categoryId: cid, period: period.rawValue, amount: amt, isPercentage: isPercentage, isActive: isActive))
            }
            await onSaved()
            dismiss()
        } catch {
            self.error = error.localizedDescription
        }
    }
}
