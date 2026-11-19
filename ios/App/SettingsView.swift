import SwiftUI
import FinanceHubCore
import FinanceHubUI

struct SettingsView: View {
    let api: APIClient
    @State private var name = ""
    @State private var email = ""
    @State private var currentPassword = ""
    @State private var newPassword = ""
    @State private var isLoading = false
    @State private var message: String?
    @State private var error: String?

    var body: some View {
        Form {
            Section("الملف الشخصي") {
                TextField("الاسم", text: $name)
                TextField("البريد الإلكتروني", text: $email)
                    .keyboardType(.emailAddress)
                    .textInputAutocapitalization(.never)
                Button("حفظ") { Task { await saveProfile() } }
                    .disabled(isLoading)
            }
            Section("كلمة المرور") {
                SecureField("الحالية", text: $currentPassword)
                SecureField("الجديدة", text: $newPassword)
                Button("تغيير") { Task { await changePassword() } }
                    .disabled(isLoading)
            }
            if let message { Text(message).foregroundStyle(FHTheme.success) }
            if let error { Text(error).foregroundStyle(FHTheme.danger) }
        }
        .scrollContentBackground(.hidden)
        .background(FHTheme.bgPrimary)
        .navigationTitle("الإعدادات")
        .task { await load() }
    }

    private func load() async {
        do {
            let u = try await api.me()
            name = u.name
            email = u.email
        } catch { self.error = error.localizedDescription }
    }

    private func saveProfile() async {
        isLoading = true; message = nil; error = nil; defer { isLoading = false }
        do {
            struct Body: Encodable { let name: String; let email: String }
            let r: GenericMessage = try await api.request("auth/profile", method: "PUT", body: Body(name: name, email: email))
            message = r.message ?? "تم التحديث"
        } catch { self.error = error.localizedDescription }
    }

    private func changePassword() async {
        isLoading = true; message = nil; error = nil; defer { isLoading = false }
        do {
            struct Body: Encodable {
                let currentPassword: String
                let newPassword: String
            }
            let r: GenericMessage = try await api.request("auth/password", method: "PUT", body: Body(currentPassword: currentPassword, newPassword: newPassword))
            message = r.message ?? "تم التغيير"
            currentPassword = ""
            newPassword = ""
        } catch { self.error = error.localizedDescription }
    }
}
