// swift-tools-version: 6.0
import PackageDescription

let package = Package(
    name: "FinanceHubiOS",
    platforms: [
        .iOS(.v17),
        .macOS(.v14),
    ],
    products: [
        .library(name: "FinanceHubCore", targets: ["FinanceHubCore"]),
        .library(name: "FinanceHubUI", targets: ["FinanceHubUI"]),
    ],
    targets: [
        .target(
            name: "FinanceHubCore",
            dependencies: [],
            path: "Sources/FinanceHubCore"
        ),
        .target(
            name: "FinanceHubUI",
            dependencies: ["FinanceHubCore"],
            path: "Sources/FinanceHubUI"
        ),
        // App target is built via XcodeGen (ios/project.yml), not SPM.
        // XCTest is only available with full Xcode; keep tests under ios/Tests for Xcode runs.
    ]
)
