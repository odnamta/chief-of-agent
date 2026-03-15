// swift-tools-version: 5.9

import PackageDescription

let package = Package(
    name: "ChiefOfAgent",
    platforms: [
        .macOS(.v14)
    ],
    targets: [
        .executableTarget(
            name: "ChiefOfAgent",
            path: "Sources/ChiefOfAgent"
        ),
        .testTarget(
            name: "ChiefOfAgentTests",
            dependencies: ["ChiefOfAgent"],
            path: "Tests/ChiefOfAgentTests"
        ),
    ]
)
