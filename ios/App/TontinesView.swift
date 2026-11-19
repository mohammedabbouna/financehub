import SwiftUI
import FinanceHubCore
import FinanceHubUI

struct TontinesView: View {
    let api: APIClient
    @State private var tontines: [Tontine] = []
    @State private var isLoading = true
    @State private var error: String?

    var body: some View {
        Group {
            if isLoading { ProgressView() }
            else if let error { Text(error).foregroundStyle(FHTheme.danger) }
            else {
                List(tontines) { t in
                    NavigationLink {
                        TontineDetailView(api: api, id: t.id)
                    } label: {
                        VStack(alignment: .leading, spacing: 4) {
                            Text(t.name).foregroundStyle(FHTheme.textPrimary)
                            Text("\(t.memberCount) أعضاء • \(Money.format(t.amount))/دورة")
                                .font(.caption).foregroundStyle(FHTheme.textSecondary)
                            if let next = t.nextDueDate { Text("التالي: \(next)").font(.caption2).foregroundStyle(FHTheme.textMuted) }
                        }
                    }
                    .listRowBackground(FHTheme.bgCard)
                }
                .scrollContentBackground(.hidden)
            }
        }
        .background(FHTheme.bgPrimary)
        .navigationTitle("العمّارية")
        .task {
            isLoading = true; error = nil; defer { isLoading = false }
            do {
                let r: TontinesResponse = try await api.request("tontines")
                tontines = r.tontines
            } catch { self.error = error.localizedDescription }
        }
    }
}

struct TontineDetailView: View {
    let api: APIClient
    let id: Int
    @State private var tontine: Tontine?
    @State private var isLoading = true
    @State private var error: String?

    var body: some View {
        Group {
            if isLoading { ProgressView() }
            else if let error { Text(error).foregroundStyle(FHTheme.danger) }
            else if let t = tontine {
                ScrollView {
                    VStack(alignment: .leading, spacing: 16) {
                        Text(t.name).font(.title.bold()).foregroundStyle(FHTheme.textPrimary)
                        card("معلومات") {
                            row("المبلغ", t.amount)
                            row("الأعضاء", Double(t.memberCount))
                            row("المجموع المقبوض", t.totalCollected)
                        }
                        if !t.members.isEmpty {
                            card("الأعضاء") {
                                ForEach(t.members) { m in
                                    HStack {
                                        Text(m.name).foregroundStyle(FHTheme.textPrimary)
                                        Spacer()
                                        Text("#\(m.position)").foregroundStyle(FHTheme.textMuted)
                                    }
                                }
                            }
                        }
                        if !t.cycles.isEmpty {
                            card("الدورات") {
                                ForEach(t.cycles) { c in
                                    HStack {
                                        Text("دورة \(c.index)").foregroundStyle(FHTheme.textPrimary)
                                        Spacer()
                                        Text(c.status).font(.caption).foregroundStyle(FHTheme.textSecondary)
                                    }
                                }
                            }
                        }
                    }
                    .padding()
                }
            }
        }
        .background(FHTheme.bgPrimary)
        .task {
            isLoading = true; error = nil; defer { isLoading = false }
            do {
                let r: TontineResponse = try await api.request("tontines/\(id)")
                tontine = r.tontine
            } catch { self.error = error.localizedDescription }
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
            Text(value == value.rounded() && value < 1000 ? String(format: "%.0f", value) : Money.format(value))
                .foregroundStyle(FHTheme.textSecondary)
        }
    }
}
