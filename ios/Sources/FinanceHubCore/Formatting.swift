import Foundation

public enum PrivacyMode {
    public nonisolated(unsafe) static var isHidden: Bool = false
}

public enum Money {
    public static func format(_ value: Double, currency: String = "DZD", hidden: Bool = PrivacyMode.isHidden) -> String {
        if hidden { return "••••" }
        let formatter = NumberFormatter()
        formatter.numberStyle = .currency
        formatter.currencyCode = currency
        formatter.locale = Locale(identifier: "ar_DZ")
        formatter.maximumFractionDigits = (currency == "DZD") ? 0 : 2
        return formatter.string(from: NSNumber(value: value)) ?? String(format: "%.0f", value)
    }

    public static func compact(_ value: Double, hidden: Bool = PrivacyMode.isHidden) -> String {
        if hidden { return "••••" }
        if abs(value) >= 1_000_000 { return String(format: "%.1fM", value / 1_000_000) }
        if abs(value) >= 1_000 { return String(format: "%.1fK", value / 1_000) }
        return String(format: "%.0f", value)
    }
}

public enum Dates {
    public static func parse(_ s: String) -> Date? {
        let f = DateFormatter()
        f.locale = Locale(identifier: "ar_DZ")
        for fmt in ["yyyy-MM-dd", "yyyy-MM-dd'T'HH:mm:ss", "dd/MM/yyyy"] {
            f.dateFormat = fmt
            if let d = f.date(from: s) { return d }
        }
        return ISO8601DateFormatter().date(from: s)
    }
}
