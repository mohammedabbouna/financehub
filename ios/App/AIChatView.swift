import SwiftUI
import FinanceHubCore
import FinanceHubUI

// ChatMessage is not Identifiable (id is optional from backend); use indices.

struct AIChatView: View {
    let api: APIClient
    @State private var messages: [ChatMessage] = []
    @State private var input = ""
    @State private var isLoading = false
    @State private var error: String?

    var body: some View {
        VStack(spacing: 0) {
            ScrollView {
                VStack(alignment: .leading, spacing: 12) {
                    ForEach(messages.indices, id: \.self) { i in
                        let m = messages[i]
                        HStack {
                            if m.role == .assistant { Spacer(minLength: 40) }
                            Text(m.message)
                                .padding(10)
                                .background(m.role == .user ? FHTheme.accent.opacity(0.2) : FHTheme.bgCard)
                                .foregroundStyle(FHTheme.textPrimary)
                                .clipShape(RoundedRectangle(cornerRadius: 12))
                            if m.role == .user { Spacer(minLength: 40) }
                        }
                    }
                    if isLoading { ProgressView() }
                }
                .padding()
            }
            HStack {
                TextField("رسالة...", text: $input)
                    .textFieldStyle(.roundedBorder)
                Button("إرسال") { Task { await send() } }
                    .disabled(input.trimmingCharacters(in: .whitespaces).isEmpty || isLoading)
            }
            .padding()
        }
        .background(FHTheme.bgPrimary)
        .navigationTitle("المساعد المالي")
        .task { await loadHistory() }
    }

    private func loadHistory() async {
        // best-effort
        struct Resp: Decodable { let history: [ChatMessage]? }
        if let r: Resp = try? await api.request("ai/chat/history") {
            messages = r.history ?? []
        }
    }

    private func send() async {
        let text = input
        input = ""
        messages.append(ChatMessage(id: nil, role: .user, message: text, createdAt: nil))
        isLoading = true
        error = nil
        defer { isLoading = false }
        do {
            struct Body: Encodable { let message: String }
            let r: ChatResponse = try await api.request("ai/chat", method: "POST", body: Body(message: text))
            messages.append(ChatMessage(id: nil, role: .assistant, message: r.response, createdAt: nil))
        } catch {
            self.error = error.localizedDescription
        }
    }
}
