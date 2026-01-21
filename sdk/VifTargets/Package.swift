// swift-tools-version:5.7
import PackageDescription

let package = Package(
    name: "VifTargets",
    platforms: [
        .macOS(.v12)
    ],
    products: [
        .library(
            name: "VifTargets",
            targets: ["VifTargets"]
        ),
    ],
    targets: [
        .target(
            name: "VifTargets",
            dependencies: []
        ),
    ]
)
