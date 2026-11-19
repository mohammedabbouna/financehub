import XCTest
@testable import FinanceHubCore

final class FormattingTests: XCTestCase {
    func testMoneyFormatHidden() {
        PrivacyMode.isHidden = true
        XCTAssertEqual(Money.format(1234), "••••")
        PrivacyMode.isHidden = false
    }

    func testMoneyCompact() {
        XCTAssertEqual(Money.compact(1500), "1.5K")
        XCTAssertEqual(Money.compact(2_000_000), "2.0M")
    }
}
