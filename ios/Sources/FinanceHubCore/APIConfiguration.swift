import Foundation

public struct APIConfiguration: Sendable {
    public let baseURL: URL
    public init(baseURL: URL = URL(string: "http://localhost/api/v1")!) {
        self.baseURL = baseURL
    }
    public static let `default` = APIConfiguration()
}
