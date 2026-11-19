import SwiftUI
import FinanceHubCore
import FinanceHubUI

extension Color {
    init(hexString: String) {
        let hex = hexString.trimmingCharacters(in: CharacterSet(charactersIn: "#"))
        var rgb: UInt64 = 0
        Scanner(string: hex).scanHexInt64(&rgb)
        self.init(hex: UInt(rgb))
    }
}

struct CategoriesView: View {
    let api: APIClient
    @State private var categories: [FinanceHubCore.Category] = []
    @State private var isLoading = true
    @State private var error: String?
    @State private var showForm = false
    @State private var editing: FinanceHubCore.Category?

    var body: some View {
        Group {
            if isLoading {
                ProgressView()
            } else if let error {
                Text(error).foregroundStyle(FHTheme.danger)
            } else {
                List(categories) { c in
                    HStack {
                        Text(c.icon).font(.title3)
                        VStack(alignment: .leading) {
                            Text(c.name).foregroundStyle(FHTheme.textPrimary)
                            Text(c.type.rawValue).font(.caption).foregroundStyle(FHTheme.textMuted)
                        }
                        Spacer()
                        Circle().fill(Color(hexString: c.color)).frame(width: 12, height: 12)
                    }
                    .listRowBackground(FHTheme.bgCard)
                    .swipeActions {
                        Button("تعديل") { editing = c; showForm = true }
                        Button("حذف", role: .destructive) { Task { await delete(c) } }
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
            CategoryFormView(api: api, category: editing) { await load() }
        }
        .task { await load() }
    }

    private func delete(_ c: FinanceHubCore.Category) async {
        do {
            let _: GenericMessage? = try await api.request("categories/\(c.id)", method: "DELETE")
            await load()
        } catch { self.error = error.localizedDescription }
    }

    private func load() async {
        isLoading = true
        error = nil
        defer { isLoading = false }
        do {
            let r: CategoriesResponse = try await api.request("categories")
            categories = r.categories
        } catch {
            self.error = error.localizedDescription
        }
    }
}
