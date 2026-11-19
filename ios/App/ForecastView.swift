import SwiftUI
import FinanceHubCore
import FinanceHubUI

struct ForecastView: View {
    let api: APIClient
    @State private var forecast: Forecast?
    @State private var isLoading = true
    @State private var error: String?

    var body: some View {
        Group {
            if isLoading { ProgressView() }
            else if let error { Text(error).foregroundStyle(FHTheme.danger) }
            else if let f = forecast {
                ScrollView {
                    VStack(alignment: .leading, spacing: 16) {
                        Text("التنبؤ").font(.title.bold()).foregroundStyle(FHTheme.textPrimary)
                        card("الملخص") {
                            row("الرصيد الحالي", f.currentBalance)
                            row("متوسط يومي", f.avgDailyNet)
                            row("الفواتير القادمة", f.upcomingBills)
                            if let runway = f.estimatedRunway { Text("Runway: \(runway, specifier: "%.0f") يوم").foregroundStyle(FHTheme.textSecondary) }
                        }
                        card("النقاط") {
                            ForEach(f.forecast.prefix(10)) { p in
                                HStack {
                                    Text(p.date).foregroundStyle(FHTheme.textPrimary)
                                    Spacer()
                                    Text(Money.format(p.projectedBalance)).foregroundStyle(FHTheme.textSecondary)
                                }
                            }
                        }
                    }
                    .padding()
                }
            }
        }
        .background(FHTheme.bgPrimary)
        .navigationTitle("Forecast")
        .task {
            isLoading = true; error = nil; defer { isLoading = false }
            do { forecast = try await api.request("forecast") }
            catch { self.error = error.localizedDescription }
        }
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
}

extension ForecastPoint: Identifiable {
    public var id: String { date }
}
