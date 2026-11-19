import Foundation

public enum APIError: Error, Sendable, LocalizedError {
    case invalidURL
    case transport(Error)
    case httpStatus(Int, String?)
    case decoding(Error)
    case unauthorized
    case noRefreshToken

    public var errorDescription: String? {
        switch self {
        case .invalidURL: return "Invalid URL"
        case .transport(let e): return e.localizedDescription
        case .httpStatus(let code, let msg): return msg ?? "HTTP \(code)"
        case .decoding(let e): return e.localizedDescription
        case .unauthorized: return "Authentication required"
        case .noRefreshToken: return "No refresh token"
        }
    }
}

// MARK: - Auth store (Keychain-backed token persistence)

import Security

public final class AuthStore: @unchecked Sendable {
    private let service = "com.financehub.ios"
    private let accessKey = "access_token"
    private let refreshKey = "refresh_token"

    public init() {}

    public func setTokens(access: String, refresh: String) {
        set(access, for: accessKey)
        set(refresh, for: refreshKey)
    }

    public func accessToken() -> String? { get(accessKey) }
    public func refreshToken() -> String? { get(refreshKey) }

    public func clear() {
        delete(accessKey)
        delete(refreshKey)
    }

    private func set(_ value: String, for key: String) {
        let data = Data(value.utf8)
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: key,
        ]
        SecItemDelete(query as CFDictionary)
        var attrs = query
        attrs[kSecValueData as String] = data
        attrs[kSecAttrAccessible as String] = kSecAttrAccessibleWhenUnlockedThisDeviceOnly
        SecItemAdd(attrs as CFDictionary, nil)
    }

    private func get(_ key: String) -> String? {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: key,
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne,
        ]
        var result: AnyObject?
        let status = SecItemCopyMatching(query as CFDictionary, &result)
        guard status == errSecSuccess, let data = result as? Data else { return nil }
        return String(data: data, encoding: .utf8)
    }

    private func delete(_ key: String) {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: key,
        ]
        SecItemDelete(query as CFDictionary)
    }
}
