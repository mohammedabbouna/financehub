import SwiftUI
import FinanceHubUI

struct ComingSoonView: View {
    let title: String
    var body: some View {
        VStack(spacing: 12) {
            Text(title).font(.title2.bold()).foregroundStyle(FHTheme.textPrimary)
            Text("قيد الإنشاء — سيتم تنفيذه في مرحلة لاحقة.").foregroundStyle(FHTheme.textMuted)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(FHTheme.bgPrimary)
        .navigationTitle(title)
    }
}
