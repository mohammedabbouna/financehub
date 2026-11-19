import SwiftUI
import FinanceHubCore
import FinanceHubUI

struct OnboardingView: View {
    let api: APIClient
    let user: User
    let onFinish: () -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var walletName = "المحفظة الرئيسية"
    @State private var balance = ""
    @State private var salary = ""
    @State private var isLoading = false
    @State private var error: String?
    @State private var step = 1

    var body: some View {
        NavigationStack {
            VStack(spacing: 20) {
                Text("مرحباً، \(user.name)").font(.title.bold()).foregroundStyle(FHTheme.textPrimary)
                Text("إعداد أولي").foregroundStyle(FHTheme.textSecondary)
                if step == 1 {
                    TextField("اسم المحفظة", text: $walletName)
                    TextField("الرصيد الافتتاحي", text: $balance).keyboardType(.decimalPad)
                    Button("إنشاء محفظة") { Task { await createWallet() } }
                        .buttonStyle(.borderedProminent).tint(FHTheme.accent).disabled(isLoading)
                } else if step == 2 {
                    TextField("الراتب (اختياري)", text: $salary).keyboardType(.decimalPad)
                    Button("اقتراح ميزانيات") { Task { await suggest() } }
                        .buttonStyle(.borderedProminent).tint(FHTheme.accent).disabled(isLoading)
                    Button("تخطي") { finish() }
                }
                if let error { Text(error).foregroundStyle(FHTheme.danger) }
                if isLoading { ProgressView() }
            }
            .padding()
            .background(FHTheme.bgPrimary)
            .navigationTitle("Onboarding")
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) { Button("تخطي") { finish() } }
            }
        }
    }

    private func createWallet() async {
        isLoading = true; error = nil; defer { isLoading = false }
        do {
            struct Body: Encodable {
                let name: String; let type: String; let currency: String; let balance: Double; let icon: String; let color: String
            }
            let _: GenericMessage? = try await api.request("wallets", method: "POST", body: Body(name: walletName, type: "cash", currency: "DZD", balance: Double(balance) ?? 0, icon: "wallet", color: "#3b82f6"))
            step = 2
        } catch { self.error = error.localizedDescription }
    }

    private func suggest() async {
        isLoading = true; error = nil; defer { isLoading = false }
        do {
            if !salary.isEmpty, let amt = Double(salary) {
                // create recurring salary not required; auto-suggest budgets uses income
                _ = amt
            }
            let _: GenericMessage? = try await api.request("budgets/auto-suggest", method: "POST")
            finish()
        } catch { self.error = error.localizedDescription }
    }

    private func finish() {
        onFinish()
        dismiss()
    }
}
