import XCTest
@testable import FinanceHubCore

final class ModelsDecodingTests: XCTestCase {
    func testWalletDecoding() throws {
        let json = """
        {"id":1,"user_id":2,"name":"Main","type":"bank","currency":"DZD","balance":1000.5,"icon":"wallet","color":"#fff","is_archived":false,"created_at":"2026-01-01"}
        """
        let d = JSONDecoder(); d.keyDecodingStrategy = .convertFromSnakeCase
        let w = try d.decode(Wallet.self, from: Data(json.utf8))
        XCTAssertEqual(w.id, 1)
        XCTAssertEqual(w.type, .bank)
        XCTAssertEqual(w.balance, 1000.5)
    }

    func testActionDecoding() throws {
        let json = """
        {"id":1,"user_id":2,"wallet_id":3,"target_wallet_id":null,"type":"deposit","amount":50,"category_id":4,"description":"test","date":"2026-01-01","tag":null,"receipt_url":null,"transfer_group_id":null,"created_at":"2026-01-01"}
        """
        let d = JSONDecoder(); d.keyDecodingStrategy = .convertFromSnakeCase
        let a = try d.decode(Action.self, from: Data(json.utf8))
        XCTAssertEqual(a.type, .deposit)
        XCTAssertEqual(a.amount, 50)
    }

    func testGenericMessage() throws {
        let json = "{\"message\":\"ok\",\"error\":null,\"code\":200}"
        let d = JSONDecoder(); d.keyDecodingStrategy = .convertFromSnakeCase
        let m = try d.decode(GenericMessage.self, from: Data(json.utf8))
        XCTAssertEqual(m.message, "ok")
    }
}
