import SwiftUI

@main
struct BrokenArrowHealthApp: App {
    @StateObject private var health = HealthManager()

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environmentObject(health)
        }
    }
}
