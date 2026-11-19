import Foundation

public actor APIClient {
    private let config: APIConfiguration
    private let session: URLSession
    private let authStore: AuthStore
    private let decoder: JSONDecoder
    private let encoder: JSONEncoder
    private var refreshTask: Task<Void, Error>?

    public init(config: APIConfiguration = .default, authStore: AuthStore = AuthStore(), session: URLSession = .shared) {
        self.config = config
        self.session = session
        self.authStore = authStore
        let d = JSONDecoder()
        d.keyDecodingStrategy = .convertFromSnakeCase
        self.decoder = d
        let e = JSONEncoder()
        e.keyEncodingStrategy = .convertToSnakeCase
        self.encoder = e
    }

    public func request<T: Decodable>(_ path: String, method: String = "GET", body: (any Encodable)? = nil, query: [String: String]? = nil, authenticated: Bool = true) async throws -> T {
        var url = config.baseURL.appendingPathComponent(path.trimmingCharacters(in: CharacterSet(charactersIn: "/")))
        if let query, !query.isEmpty {
            var comps = URLComponents(url: url, resolvingAgainstBaseURL: false)!
            comps.queryItems = query.map { URLQueryItem(name: $0.key, value: $0.value) }
            url = comps.url!
        }
        var req = URLRequest(url: url)
        req.httpMethod = method
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        if authenticated, let token = authStore.accessToken() {
            req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }
        if let body {
            req.httpBody = try encoder.encode(AnyEncodable(body))
        }

        let (data, response) = try await session.data(for: req)
        guard let http = response as? HTTPURLResponse else { throw APIError.transport(URLError(.badServerResponse)) }

        if http.statusCode == 401 && authenticated {
            try await refresh()
            return try await request(path, method: method, body: body, query: query, authenticated: authenticated)
        }

        guard (200..<300).contains(http.statusCode) else {
            let msg = String(data: data, encoding: .utf8)
            throw APIError.httpStatus(http.statusCode, msg)
        }

        do {
            return try decoder.decode(T.self, from: data)
        } catch {
            throw APIError.decoding(error)
        }
    }

    public func requestVoid(_ path: String, method: String = "POST", body: (any Encodable)? = nil, authenticated: Bool = true) async throws {
        let _: GenericMessage? = try? await request(path, method: method, body: body, authenticated: authenticated)
    }

    private func refresh() async throws {
        if let task = refreshTask {
            try await task.value
            return
        }
        let task = Task<Void, Error> {
            guard let refreshToken = authStore.refreshToken() else { throw APIError.noRefreshToken }
            struct Body: Encodable { let refresh_token: String }
            struct Resp: Decodable { let tokens: AuthTokens }
            let url = config.baseURL.appendingPathComponent("auth/refresh")
            var req = URLRequest(url: url)
            req.httpMethod = "POST"
            req.setValue("application/json", forHTTPHeaderField: "Content-Type")
            req.httpBody = try JSONEncoder().encode(Body(refresh_token: refreshToken))
            let (data, response) = try await session.data(for: req)
            guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode) else {
                authStore.clear()
                throw APIError.unauthorized
            }
            let d = JSONDecoder(); d.keyDecodingStrategy = .convertFromSnakeCase
            let decoded = try d.decode(Resp.self, from: data)
            authStore.setTokens(access: decoded.tokens.accessToken, refresh: decoded.tokens.refreshToken)
        }
        refreshTask = task
        do {
            try await task.value
        } catch {
            refreshTask = nil
            throw error
        }
        refreshTask = nil
    }

    // Auth helpers
    public func login(email: String, password: String) async throws -> AuthResponse {
        struct Body: Encodable { let email: String; let password: String }
        return try await request("auth/login", method: "POST", body: Body(email: email, password: password), authenticated: false)
    }

    public func register(name: String, email: String, password: String) async throws -> AuthResponse {
        struct Body: Encodable { let name: String; let email: String; let password: String }
        return try await request("auth/register", method: "POST", body: Body(name: name, email: email, password: password), authenticated: false)
    }

    public func me() async throws -> User {
        struct Resp: Decodable { let user: User }
        let r: Resp = try await request("auth/me")
        return r.user
    }

    public func setTokens(_ tokens: AuthTokens) {
        authStore.setTokens(access: tokens.accessToken, refresh: tokens.refreshToken)
    }

    public func clearAuth() { authStore.clear() }
    public func isAuthenticated() -> Bool { authStore.accessToken() != nil }

    public func exportCSV(from: String? = nil, to: String? = nil) async throws -> String {
        var comps = URLComponents(url: config.baseURL.appendingPathComponent("export/actions"), resolvingAgainstBaseURL: false)!
        var items: [URLQueryItem] = []
        if let from { items.append(URLQueryItem(name: "from", value: from)) }
        if let to { items.append(URLQueryItem(name: "to", value: to)) }
        if !items.isEmpty { comps.queryItems = items }
        var req = URLRequest(url: comps.url!)
        req.httpMethod = "GET"
        if let token = authStore.accessToken() { req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization") }
        let (data, response) = try await session.data(for: req)
        guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode) else {
            throw APIError.httpStatus((response as? HTTPURLResponse)?.statusCode ?? 500, String(data: data, encoding: .utf8))
        }
        return String(data: data, encoding: .utf8) ?? ""
    }
}

// Helper to erase Encodable
private struct AnyEncodable: Encodable {
    private let encodeFunc: (Encoder) throws -> Void
    init(_ value: any Encodable) {
        self.encodeFunc = { encoder in
            try value.encode(to: encoder)
        }
    }
    func encode(to encoder: Encoder) throws { try encodeFunc(encoder) }
}
// Note: request body encoding uses AnyEncodable wrapper; above works.
