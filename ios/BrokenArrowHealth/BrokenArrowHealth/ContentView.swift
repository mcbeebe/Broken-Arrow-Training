import SwiftUI

struct ContentView: View {
    @EnvironmentObject var health: HealthManager
    @EnvironmentObject var workouts: WorkoutManager
    @EnvironmentObject var auth: AuthManager

    var body: some View {
        NavigationView {
            VStack(spacing: 20) {
                if auth.isSignedIn {
                    connectedView
                } else {
                    setupView
                }
            }
            .padding()
            .navigationTitle("Broken Arrow Health")
        }
        .onAppear { wireUp() }
        .onChange(of: auth.sessionToken) { _, _ in wireUp() }
        .onChange(of: health.isAuthorized) { _, authed in
            // Once HealthKit access is granted, back-fill ~90 days of workouts
            // once (incremental syncs after that come from the observer).
            if authed { Task { await workouts.syncWorkouts(daysBack: 90) } }
        }
    }

    private func wireUp() {
        guard auth.isSignedIn, !auth.apiUrl.isEmpty,
              let token = auth.sessionToken else { return }
        health.configure(apiUrl: auth.apiUrl, sessionToken: token)
        workouts.configure(apiUrl: auth.apiUrl, sessionToken: token)
        health.requestAuthorization()
    }

    private var setupView: some View {
        VStack(spacing: 16) {
            Image(systemName: "heart.text.square.fill")
                .font(.system(size: 60))
                .foregroundColor(.green)
            Text("Connect to Broken Arrow")
                .font(.title2).bold()
            Text("Sign in with the Google account your coach uses. The app will sync your Apple Watch HRV, resting HR, sleep, and workouts into Broken Arrow Training.")
                .font(.subheadline)
                .foregroundColor(.secondary)
                .multilineTextAlignment(.center)
            TextField("API URL (https://...)", text: $auth.apiUrl)
                .textFieldStyle(.roundedBorder)
                .autocapitalization(.none)
                .disableAutocorrection(true)
                .keyboardType(.URL)
                .padding(.horizontal)
            Button {
                Task {
                    guard let root = rootViewController() else { return }
                    await auth.signIn(presenting: root)
                }
            } label: {
                HStack {
                    if auth.isSigningIn {
                        ProgressView().tint(.white)
                    } else {
                        Image(systemName: "person.crop.circle.fill")
                    }
                    Text(auth.isSigningIn ? "Signing in…" : "Sign in with Google")
                }
                .font(.headline)
                .frame(maxWidth: .infinity)
                .padding()
                .background(Color.blue)
                .foregroundColor(.white)
                .cornerRadius(12)
            }
            .disabled(auth.apiUrl.isEmpty || auth.isSigningIn)
            .padding(.horizontal)
            if let error = auth.lastError {
                Text(error)
                    .font(.caption)
                    .foregroundColor(.red)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal)
            }
        }
    }

    private var connectedView: some View {
        VStack(spacing: 16) {
            HStack {
                Circle()
                    .fill(health.lastSyncDate != nil ? Color.green : Color.orange)
                    .frame(width: 10, height: 10)
                Text(health.isAuthorized ? "Connected" : "Waiting for Apple Health permissions…")
                    .font(.headline)
                Spacer()
            }
            VStack(alignment: .leading, spacing: 2) {
                if let name = auth.displayName, !name.isEmpty {
                    Text(name).font(.subheadline).bold()
                }
                if let email = auth.email, !email.isEmpty {
                    Text(email).font(.caption).foregroundColor(.secondary)
                }
                if let id = auth.athleteId, !id.isEmpty {
                    Text("Athlete: \(id)").font(.caption).foregroundColor(.secondary)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            if let lastSync = health.lastSyncDate {
                Text("Last sync: \(lastSync, style: .relative) ago")
                    .font(.caption)
                    .foregroundColor(.secondary)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
            if let error = health.lastError {
                Text(error)
                    .font(.caption)
                    .foregroundColor(.red)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
            Spacer()
            Button {
                Task {
                    await health.syncNow()
                    await workouts.syncWorkouts()
                }
            } label: {
                HStack {
                    if health.isSyncing || workouts.isSyncing {
                        ProgressView().tint(.white)
                    }
                    Text(health.isSyncing || workouts.isSyncing ? "Syncing…" : "Sync Now")
                }
                .font(.headline)
                .frame(maxWidth: .infinity)
                .padding()
                .background(Color.teal)
                .foregroundColor(.white)
                .cornerRadius(12)
            }
            .disabled(health.isSyncing || workouts.isSyncing || !health.isAuthorized)
            Button("Sign out") {
                auth.signOut()
                health.disconnect()
                workouts.disconnect()
            }
            .font(.subheadline)
            .foregroundColor(.secondary)
        }
    }
}

/// Resolve the current key window's root view controller so the
/// Google sign-in sheet has something to present from.
@MainActor
func rootViewController() -> UIViewController? {
    let scenes = UIApplication.shared.connectedScenes
    let windowScene = scenes.first { $0.activationState == .foregroundActive } as? UIWindowScene
        ?? scenes.first as? UIWindowScene
    return windowScene?.windows.first(where: { $0.isKeyWindow })?.rootViewController
        ?? windowScene?.windows.first?.rootViewController
}

#Preview {
    ContentView()
        .environmentObject(HealthManager())
        .environmentObject(WorkoutManager())
        .environmentObject(AuthManager())
}
