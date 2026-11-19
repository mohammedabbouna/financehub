import SwiftUI
import FinanceHubCore
import FinanceHubUI

struct ExportView: View {
    let api: APIClient
    @State private var csv = ""
    @State private var isLoading = false
    @State private var error: String?

    var body: some View {
        VStack(spacing: 16) {
            Text("تصدير العمليات (CSV)").font(.title2.bold()).foregroundStyle(FHTheme.textPrimary)
            if isLoading { ProgressView() }
            if let error { Text(error).foregroundStyle(FHTheme.danger) }
            Button(isLoading ? "جارٍ..." : "جلب CSV") {
                Task { await load() }
            }
            .buttonStyle(.borderedProminent).tint(FHTheme.accent).disabled(isLoading)
            if !csv.isEmpty {
                ShareLink(item: csv, subject: Text("FinanceHub export"), message: Text("CSV"))
            }
            Spacer()
        }
        .padding()
        .background(FHTheme.bgPrimary)
        .navigationTitle("تصدير")
    }

    private func load() async {
        isLoading = true; error = nil; defer { isLoading = false }
        do { csv = try await api.exportCSV() }
        catch { self.error = error.localizedDescription }
    }
}
