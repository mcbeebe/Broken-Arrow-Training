import SwiftUI
import GoogleSignIn

@main
struct BrokenArrowHealthApp: App {
    @StateObject private var healthManager = HealthManager()
    @StateObject private var authManager = AuthManager()

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environmentObject(healthManager)
                .environmentObject(authManager)
                .onAppear {
                    // Attempt to restore a previous Google sign-in session
                    // silently. Our server-issued JWT is already in the
                    // Keychain; this lets us refresh the Google side too
                    // so token-requiring operations keep working.
                    GIDSignIn.sharedInstance.restorePreviousSignIn { _, _ in }
                }
                .onOpenURL { url in
                    // Google Sign-In completes by redirecting to the app
                    // via its reverse client ID URL scheme (configured in
                    // Info.plist). Hand the URL to the SDK.
                    GIDSignIn.sharedInstance.handle(url)
                }
        }
    }
}
