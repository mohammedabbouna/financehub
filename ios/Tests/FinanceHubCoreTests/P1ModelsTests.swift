import XCTest
@testable import FinanceHubCore

final class P1ModelsTests: XCTestCase {
    func testWalletDecoding() throws {
        let json = """
        {"id":1,"user_id":2,"name":"Main","type":"bank","currency":"DZD","balance":1000.5,"icon":"wallet","color":"#fff","is_archived":false,"created_at":"2026-01-01"}
        """
        let d = JSONDecoder(); d.keyDecodingStrategy = .convertFromSnakeCase
        let w = try d.decode(Wallet.self, from: Data(json.utf8))
        XCTAssertEqual(w.type, .bank)
        XCTAssertEqual(w.balance, 1000.5)
    }

    func testCategoryDecoding() throws {
        let json = """
        {"id":1,"user_id":null,"name":"Food","type":"expense","parent_id":null,"icon":"tag","color":"#000","is_system":true}
        """
        let d = JSONDecoder(); d.keyDecodingStrategy = .convertFromSnakeCase
        let c = try d.decode(Category.self, from: Data(json.utf8))
        XCTAssertEqual(c.type, .expense)
        XCTAssertTrue(c.isSystem)
    }

    func testBudgetDecoding() throws {
        let json = """
        {"id":1,"user_id":2,"category_id":3,"period":"monthly","amount":100,"is_percentage":false,"auto_suggested":true,"is_active":true,"spent":40,"category_name":"Food","category_icon":"tag","category_color":"#000"}
        """
        let d = JSONDecoder(); d.keyDecodingStrategy = .convertFromSnakeCase
        let b = try d.decode(Budget.self, from: Data(json.utf8))
        XCTAssertEqual(b.period, .monthly)
        XCTAssertEqual(b.spent, 40)
    }

    func testGoalDecoding() throws {
        let json = """
        {"id":1,"user_id":2,"name":"Save","target_amount":1000,"current_amount":250,"target_date":null,"linked_wallet_id":null,"icon":"target","color":"#000","is_completed":false,"progress":0.25}
        """
        let d = JSONDecoder(); d.keyDecodingStrategy = .convertFromSnakeCase
        let g = try d.decode(Goal.self, from: Data(json.utf8))
        XCTAssertEqual(g.targetAmount, 1000)
        XCTAssertEqual(g.progress, 0.25)
    }
}
