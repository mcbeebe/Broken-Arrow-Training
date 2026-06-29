import SwiftUI
import GoogleSignIn

@main
struct BrokenArrowHealthApp: App {
    @UIApplicationDelegateAdaptor(AppDelegate.self) private var appDelegate
    @StateObject private var healthManager: HealthManager
    @StateObject private var workoutManager: WorkoutManager
    @StateObject private var authManager = AuthManager()

    init() {
        let hm = HealthManager()
        let wm = WorkoutManager()
        _healthManager = StateObject(wrappedValue: hm)
        _workoutManager = StateObject(wrappedValue: wm)
        // Hand the SwiftUI-owned instances to the app delegate so a background
        // relaunch (which has no view lifecycle) re-arms the SAME managers.
        AppDelegate.healthManager = hm
        AppDelegate.workoutManager = wm
    }

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environmentObject(healthManager)
                .environmentObject(workoutManager)
                .environmentObject(authManager)
                .onAppear {
                    // Attempt to restore a previous Google sign-in session
                    // silently. Our server-issued JWT is already in the
                    // Keychain; this refreshes the Google side too.
                    GIDSignIn.sharedInstance.restorePreviousSignIn { _, _ in }
                }
                .onOpenURL { url in
                    // Google Sign-In completes by redirecting to the app via
                    // its reverse client ID URL scheme (configured in Info.plist).
                    GIDSignIn.sharedInstance.handle(url)
                }
        }
    }
}

/// On every (re)launch — including OS background relaunches to deliver a
/// HealthKit update — restore credentials from the Keychain and (re)register
/// the observers + background delivery. SwiftUI's `.onAppear` does NOT run on a
/// background relaunch, so this registration must live in the app delegate.
final class AppDelegate: NSObject, UIApplicationDelegate {
    static weak var healthManager: HealthManager?
    static weak var workoutManager: WorkoutManager?

    func application(
        _ application: UIApplication,
        didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
    ) -> Bool {
        Task { @MainActor in
            AppDelegate.healthManager?.configureFromKeychain()
            AppDelegate.workoutManager?.configureFromKeychain()
            AppDelegate.healthManager?.enableBackgroundDelivery()
            AppDelegate.healthManager?.startObservers()
            AppDelegate.workoutManager?.enableBackgroundDelivery()
            AppDelegate.workoutManager?.startObservers()
        }
        return true
    }
}
