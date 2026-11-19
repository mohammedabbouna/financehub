import SwiftUI
import UniformTypeIdentifiers
import FinanceHubCore
import FinanceHubUI

struct ImportView: View {
    let api: APIClient
    @State private var showPicker = false
    @State private var analyzed: ImportAnalyzeResponse?
    @State private var isLoading = false
    @State private var error: String?
    @State private var message: String?

    var body: some View {
        VStack(spacing: 16) {
            Text("استيراد CSV").font(.title2.bold()).foregroundStyle(FHTheme.textPrimary)
            if isLoading { ProgressView() }
            if let error { Text(error).foregroundStyle(FHTheme.danger) }
            if let message { Text(message).foregroundStyle(FHTheme.success) }
            if let a = analyzed {
                Text("صفوف: \(a.total) • صالحة: \(a.valid)").foregroundStyle(FHTheme.textSecondary)
                Button("حفظ (\(a.valid))") { Task { await commit(a) } }
                    .buttonStyle(.borderedProminent).tint(FHTheme.accent).disabled(isLoading)
            }
            Button("اختيار ملف CSV") { showPicker = true }
                .buttonStyle(.bordered)
            Spacer()
        }
        .padding()
        .background(FHTheme.bgPrimary)
        .navigationTitle("استيراد")
        .fileImporter(isPresented: $showPicker, allowedContentTypes: [.commaSeparatedText, .plainText]) { result in
            Task { await handleFile(result) }
        }
    }

    private func handleFile(_ result: Result<URL, Error>) async {
        isLoading = true; error = nil; message = nil; analyzed = nil; defer { isLoading = false }
        do {
            let url = try result.get()
            guard url.startAccessingSecurityScopedResource() else { throw APIError.invalidURL }
            defer { url.stopAccessingSecurityScopedResource() }
            let text = try String(contentsOf: url, encoding: .utf8)
            let rows = parseCSV(text)
            guard !rows.isEmpty else { throw APIError.httpStatus(422, "لا توجد صفوف") }
            struct Body: Encodable { let rows: [[String: String]] }
            let r: ImportAnalyzeResponse = try await api.request("import/analyze", method: "POST", body: Body(rows: rows))
            analyzed = r
        } catch {
            self.error = error.localizedDescription
        }
    }

    private func parseCSV(_ text: String) -> [[String: String]] {
        let lines = text.components(separatedBy: .newlines).filter { !$0.trimmingCharacters(in: .whitespaces).isEmpty }
        guard lines.count > 1 else { return [] }
        let header = splitCSVLine(lines[0])
        var out: [[String: String]] = []
        for line in lines.dropFirst() {
            let cols = splitCSVLine(line)
            var row: [String: String] = [:]
            for (i, h) in header.enumerated() {
                let v = i < cols.count ? cols[i] : ""
                row[h] = v
            }
            // Map Arabic/English headers to expected keys
            var mapped: [String: String] = [:]
            mapped["date"] = value(row, keys: ["التاريخ", "date", "Date"])
            mapped["type"] = value(row, keys: ["النوع", "type", "Type"])
            mapped["amount"] = value(row, keys: ["المبلغ", "amount", "Amount"])
            mapped["category"] = value(row, keys: ["الفئة", "category", "Category"])
            mapped["description"] = value(row, keys: ["الوصف", "description", "Description"])
            out.append(mapped)
        }
        return out
    }

    private func value(_ row: [String: String], keys: [String]) -> String {
        for k in keys { if let v = row[k], !v.isEmpty { return v } }
        return ""
    }

    private func splitCSVLine(_ line: String) -> [String] {
        // naive split handling quotes minimally
        var result: [String] = []
        var current = ""
        var inQuotes = false
        for ch in line {
            if ch == "\"" { inQuotes.toggle(); continue }
            if ch == "," && !inQuotes { result.append(current); current = ""; continue }
            current.append(ch)
        }
        result.append(current)
        return result.map { $0.trimmingCharacters(in: .whitespaces) }
    }

    private func commit(_ a: ImportAnalyzeResponse) async {
        isLoading = true; error = nil; message = nil; defer { isLoading = false }
        do {
            let commitRows: [[String: Any]] = a.rows.map { r in
                var d: [String: Any] = [
                    "date": r.date,
                    "type": r.type,
                    "amount": r.amount,
                    "description": r.description,
                ]
                if let c = r.categoryId { d["category_id"] = c }
                if let w = r.walletId { d["wallet_id"] = w }
                return d
            }
            // Need Encodable; use JSONSerialization to body? APIClient expects Encodable.
            // We'll send via a wrapper using Any.
            struct Body: Encodable {
                let rows: [[String: String]]
            }
            // Convert to string values for simplicity
            let stringRows: [[String: String]] = commitRows.map { dict in
                dict.mapValues { "\($0)" }
            }
            struct Resp: Decodable { let saved: Int?; let errors: [String]?; let message: String? }
            let r: Resp = try await api.request("import/commit", method: "POST", body: Body(rows: stringRows))
            message = r.message ?? "تم الحفظ (\(r.saved ?? 0))"
            analyzed = nil
        } catch {
            self.error = error.localizedDescription
        }
    }
}
