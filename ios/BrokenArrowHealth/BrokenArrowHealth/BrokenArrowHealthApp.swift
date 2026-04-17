import SwiftUI

@main
struct BrokenArrowHealthApp: App {
    @StateObject private var healthManager = HealthManager()

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environmentObject(healthManager)
        }
    }
}
