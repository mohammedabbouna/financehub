import SwiftUI
import FinanceHubCore
import FinanceHubUI

struct ContentView: View {
    let api: APIClient
    @StateObject private var network = NetworkMonitor()
    @State private var email = ""
    @State private var password = ""
    @State private var isLoading = false
    @State private var errorMessage: String?
    @State private var user: User?
    @State private var privacyHidden = PrivacyMode.isHidden
    @State private var showOnboarding = false

    var body: some View {
        ZStack {
            Group {
            if let user {
                TabView {
                    DashboardView(user: user, api: api)
                        .tabItem { Label("الرئيسية", systemImage: "house") }
                    WalletsView(api: api)
                        .tabItem { Label("المحافظ", systemImage: "wallet.pass") }
                    ActionsView(api: api)
                        .tabItem { Label("العمليات", systemImage: "list.bullet") }
                    NavigationStack {
                        MoreView(api: api)
                    }
                    .tabItem { Label("المزيد", systemImage: "ellipsis.circle") }
                }
            } else {
                LoginView(email: $email, password: $password, isLoading: $isLoading, errorMessage: $errorMessage) {
                    Task { await login() }
                }
            }
        }
        .frame(minWidth: 900, minHeight: 600)
        .sheet(isPresented: $showOnboarding) {
            if let u = user { OnboardingView(api: api, user: u) { showOnboarding = false } }
        }
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button {
                    privacyHidden.toggle()
                    PrivacyMode.isHidden = privacyHidden
                } label: {
                    Image(systemName: privacyHidden ? "eye.slash" : "eye")
                }
            }
        }
        if !network.isOnline {
            VStack {
                Spacer()
                Text("⚠️ أنت غير متصل — يتم عرض البيانات المخزّنة.")
                    .padding(8)
                    .background(FHTheme.warning.opacity(0.2))
                    .foregroundStyle(FHTheme.warning)
                    .clipShape(RoundedRectangle(cornerRadius: 8))
                    .padding()
            }
        }
    }
}

    private func login() async {
        isLoading = true
        errorMessage = nil
        defer { isLoading = false }
        do {
            let resp = try await api.login(email: email, password: password)
            if let tokens = resp.tokens { await api.setTokens(tokens) }
            if let u = resp.user { user = u }
            else { user = try await api.me() }
            // Onboarding if no wallets
            if let _ = user {
                let r: WalletsResponse? = try? await api.request("wallets")
                if r?.wallets.isEmpty ?? true { showOnboarding = true }
            }
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}

struct LoginView: View {
    @Binding var email: String
    @Binding var password: String
    @Binding var isLoading: Bool
    @Binding var errorMessage: String?
    let onSubmit: () -> Void

    var body: some View {
        VStack(spacing: 16) {
            Text("FinanceHub")
                .font(.largeTitle.bold())
                .foregroundStyle(FHTheme.textPrimary)
            Text("تسجيل الدخول")
                .foregroundStyle(FHTheme.textSecondary)
            TextField("البريد الإلكتروني", text: $email)
                .textFieldStyle(.roundedBorder)
                .frame(width: 320)
            SecureField("كلمة المرور", text: $password)
                .textFieldStyle(.roundedBorder)
                .frame(width: 320)
            if let errorMessage {
                Text(errorMessage).foregroundStyle(FHTheme.danger).font(.caption)
            }
            Button(action: onSubmit) {
                if isLoading { ProgressView() } else { Text("دخول") }
            }
            .buttonStyle(.borderedProminent)
            .tint(FHTheme.accent)
            .disabled(isLoading)
        }
        .padding(40)
        .fhCard()
    }
}

struct DashboardView: View {
    let user: User
    let api: APIClient
    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("مرحباً، \(user.name)")
                .font(.title.bold())
                .foregroundStyle(FHTheme.textPrimary)
            Text("لوحة التحكم — قيد الإنشاء")
                .foregroundStyle(FHTheme.textSecondary)
        }
        .padding()
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .background(FHTheme.bgPrimary)
    }
}
