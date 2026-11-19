import Foundation
import SwiftData

@Model
public final class CachedWallet {
    public var id: Int
    public var name: String
    public var type: String
    public var currency: String
    public var balance: Double
    public var icon: String
    public var color: String
    public var isArchived: Bool
    public var updatedAt: Date

    public init(from w: Wallet) {
        self.id = w.id
        self.name = w.name
        self.type = w.type.rawValue
        self.currency = w.currency
        self.balance = w.balance
        self.icon = w.icon
        self.color = w.color
        self.isArchived = w.isArchived
        self.updatedAt = Date()
    }
}

@Model
public final class CachedAction {
    public var id: Int
    public var type: String
    public var amount: Double
    public var descriptionText: String
    public var date: String
    public var updatedAt: Date

    public init(from a: Action) {
        self.id = a.id
        self.type = a.type.rawValue
        self.amount = a.amount
        self.descriptionText = a.description
        self.date = a.date
        self.updatedAt = Date()
    }
}

@Model
public final class CachedCategory {
    public var id: Int
    public var name: String
    public var type: String
    public var icon: String
    public var color: String
    public var updatedAt: Date

    public init(from c: Category) {
        self.id = c.id
        self.name = c.name
        self.type = c.type.rawValue
        self.icon = c.icon
        self.color = c.color
        self.updatedAt = Date()
    }
}
