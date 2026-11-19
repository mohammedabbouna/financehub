import SwiftUI
import FinanceHubCore
import FinanceHubUI

struct ZakatView: View {
    let api: APIClient
    @State private var calc: ZakatCalculation?
    @State private var isLoading = true
    @State private var error: String?
    @State private var saving = false

    var body: some View {
        Group {
            if isLoading { ProgressView() }
            else if let error { Text(error).foregroundStyle(FHTheme.danger) }
            else if let calc {
                ScrollView {
                    VStack(alignment: .leading, spacing: 16) {
                        Text("الزكاة").font(.title.bold()).foregroundStyle(FHTheme.textPrimary)
                        card("الأصول") {
                            row("نقد", calc.breakdown.cash)
                            row("ذهب", calc.breakdown.goldValue)
                            row("استثمارات", calc.breakdown.investmentsValue)
                            row("مستحقات", calc.breakdown.receivables)
                        }
                        card("الخصوم") { row("ديون", calc.breakdown.liabilities) }
                        card("النتيجة") {
                            row("صافي الثروة", calc.breakdown.netWealth)
                            row("النصاب", calc.nisab.value ?? 0)
                            row("الزكاة (2.5%)", calc.zakatDue)
                            Text(calc.isDue ? "مستحقة" : "غير مستحقة (لم يبلغ النصاب)")
                                .foregroundStyle(calc.isDue ? FHTheme.danger : FHTheme.success)
                        }
                        Button(saving ? "جارٍ الحفظ..." : "حفظ لقطة") {
                            Task { await save() }
                        }
                        .buttonStyle(.borderedProminent).tint(FHTheme.accent).disabled(saving)
                    }
                    .padding()
                }
            }
        }
        .background(FHTheme.bgPrimary)
        .task { await load() }
    }

    private func card(_ title: String, @ViewBuilder content: () -> some View) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(title).font(.headline).foregroundStyle(FHTheme.textSecondary)
            content()
        }
        .padding()
        .frame(maxWidth: .infinity, alignment: .leading)
        .fhCard()
    }

    private func row(_ label: String, _ value: Double) -> some View {
        HStack {
            Text(label).foregroundStyle(FHTheme.textPrimary)
            Spacer()
            Text(Money.format(value)).foregroundStyle(FHTheme.textSecondary)
        }
    }

    private func load() async {
        isLoading = true; error = nil; defer { isLoading = false }
        do { calc = try await api.request("zakat/calculate") }
        catch { self.error = error.localizedDescription }
    }

    private func save() async {
        saving = true; defer { saving = false }
        _ = try? await api.requestVoid("zakat/snapshots", method: "POST")
    }
}
