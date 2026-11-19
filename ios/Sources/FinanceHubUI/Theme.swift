import SwiftUI

public enum FHTheme {
    // Graphite
    public static let bgDeepest = Color(hex: 0x0F0F10)
    public static let bgPrimary = Color(hex: 0x141415)
    public static let bgSecondary = Color(hex: 0x1A1A1C)
    public static let bgCard = Color(hex: 0x19191B)
    public static let bgRaised = Color(hex: 0x26262A)
    public static let border = Color(hex: 0x26262A)
    public static let borderStrong = Color(hex: 0x34343A)
    public static let textPrimary = Color(hex: 0xEDEDED)
    public static let textSecondary = Color(hex: 0xA1A1A6)
    public static let textMuted = Color(hex: 0x85858B)
    // Brass accent
    public static let accent = Color(hex: 0xE0B463)
    public static let accentDark = Color(hex: 0xCFA048)
    // Semantic
    public static let success = Color(hex: 0x4CC38A)
    public static let danger = Color(hex: 0xE5484D)
    public static let warning = Color(hex: 0xD98F3F)
    public static let purple = Color(hex: 0xA78BFA)
}

public extension Color {
    init(hex: UInt, alpha: Double = 1.0) {
        self.init(
            .sRGB,
            red: Double((hex >> 16) & 0xFF) / 255.0,
            green: Double((hex >> 8) & 0xFF) / 255.0,
            blue: Double(hex & 0xFF) / 255.0,
            opacity: alpha
        )
    }
}

public struct FHCard: ViewModifier {
    public func body(content: Content) -> some View {
        content
            .padding(20)
            .background(FHTheme.bgCard)
            .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous).stroke(FHTheme.border, lineWidth: 1))
    }
}

public extension View {
    func fhCard() -> some View { modifier(FHCard()) }
}
