import SwiftUI
import SwiftData
import FinanceHubCore
import FinanceHubUI

@main
struct FinanceHubApp: App {
    @State private var api = APIClient()

    var body: some Scene {
        WindowGroup {
            ContentView(api: api)
                .environment(\.layoutDirection, .rightToLeft)
                .modelContainer(for: [CachedWallet.self, CachedAction.self, CachedCategory.self])
        }
    }
}
