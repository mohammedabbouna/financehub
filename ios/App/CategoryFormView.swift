import SwiftUI
import FinanceHubCore
import FinanceHubUI

struct CategoryFormView: View {
    let api: APIClient
    let category: FinanceHubCore.Category?
    let onSaved: () async -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var name = ""
    @State private var type: CategoryType = .expense
    @State private var icon = "tag"
    @State private var color = "#6b7280"
    @State private var isLoading = false
    @State private var error: String?

    var body: some View {
        NavigationStack {
            Form {
                Section("الفئة") {
                    TextField("الاسم", text: $name)
                    Picker("النوع", selection: $type) {
                        Text("مصروف").tag(CategoryType.expense)
                        Text("دخل").tag(CategoryType.income)
                    }
                    TextField("الأيقونة", text: $icon)
                    TextField("اللون (hex)", text: $color)
                }
                if let error { Text(error).foregroundStyle(FHTheme.danger) }
            }
            .scrollContentBackground(.hidden)
            .background(FHTheme.bgPrimary)
            .navigationTitle(category == nil ? "فئة جديدة" : "تعديل الفئة")
            .toolbar {
                ToolbarItem(placement: .topBarLeading) { Button("إلغاء") { dismiss() } }
                ToolbarItem(placement: .topBarTrailing) {
                    Button(isLoading ? "..." : "حفظ") { Task { await save() } }.disabled(isLoading)
                }
            }
            .onAppear {
                if let c = category {
                    name = c.name
                    type = c.type
                    icon = c.icon
                    color = c.color
                }
            }
        }
    }

    private func save() async {
        isLoading = true; error = nil; defer { isLoading = false }
        do {
            if let c = category {
                struct Body: Encodable {
                    let name: String; let type: String; let icon: String; let color: String
                }
                let _: GenericMessage? = try await api.request("categories/\(c.id)", method: "PUT", body: Body(name: name, type: type.rawValue, icon: icon, color: color))
            } else {
                struct Body: Encodable {
                    let name: String; let type: String; let icon: String; let color: String
                }
                let _: GenericMessage? = try await api.request("categories", method: "POST", body: Body(name: name, type: type.rawValue, icon: icon, color: color))
            }
            await onSaved()
            dismiss()
        } catch {
            self.error = error.localizedDescription
        }
    }
}
