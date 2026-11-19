import SwiftUI
import Network

final class NetworkMonitor: ObservableObject, @unchecked Sendable {
    @Published var isOnline = true
    private let monitor = NWPathMonitor()
    init() {
        monitor.pathUpdateHandler = { [weak self] path in
            DispatchQueue.main.async { self?.isOnline = (path.status == .satisfied) }
        }
        monitor.start(queue: DispatchQueue.global(qos: .background))
    }
}
