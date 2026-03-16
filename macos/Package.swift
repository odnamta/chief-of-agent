// swift-tools-version: 5.9

import PackageDescription

let package = Package(
    name: "ChiefOfAgent",
    platforms: [
        .macOS(.v14)
    ],
    dependencies: [
        .package(url: "https://github.com/apple/swift-testing.git", from: "0.10.0"),
    ],
    targets: [
        .target(
            name: "ChiefOfAgentCore",
            path: "Sources/ChiefOfAgentCore"
        ),
        .executableTarget(
            name: "ChiefOfAgent",
            dependencies: ["ChiefOfAgentCore"],
            path: "Sources/ChiefOfAgent"
        ),
        .testTarget(
            name: "ChiefOfAgentTests",
            dependencies: [
                "ChiefOfAgentCore",
                .product(name: "Testing", package: "swift-testing"),
            ],
            path: "Tests/ChiefOfAgentTests"
        ),
    ]
)
