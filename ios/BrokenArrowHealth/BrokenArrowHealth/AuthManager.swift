import Foundation
import SwiftUI
import GoogleSignIn

/// Drives the sign-in flow: tap button → Google Sign-In sheet → server
/// exchange → Keychain-persisted session. The iOS app never sees an
/// athlete ID directly; the server returns one after verifying the
/// Google ID token against the email→athlete map.
@MainActor
final class AuthManager: ObservableObject {
    @Published var sessionToken: String?
    @Published var athleteId: String?
    @Published var email: String?
    @Published var displayName: String?
    @Published var isSigningIn = false
    @Published var lastError: String?

    /// The user fills this in on first launch. Stored in UserDefaults
    /// (not secret — just the server URL).
    @AppStorage("apiUrl") var apiUrl: String = ""

    init() {
        restoreFromKeychain()
    }

    var isSignedIn: Bool { sessionToken != nil && athleteId != nil }

    private func restoreFromKeychain() {
        sessionToken = KeychainStore.get("session_token")
        athleteId = KeychainStore.get("athlete_id")
        email = KeychainStore.get("email")
        displayName = KeychainStore.get("display_name")
    }

    func signIn(presenting: UIViewController) async {
        guard !apiUrl.isEmpty else {
            lastError = "Set the API URL before signing in."
            return
        }
        isSigningIn = true
        lastError = nil
        do {
            let result = try await GIDSignIn.sharedInstance.signIn(withPresenting: presenting)
            guard let idToken = result.user.idToken?.tokenString else {
                throw NSError(domain: "AuthManager", code: 1, userInfo: [
                    NSLocalizedDescriptionKey: "Google didn't return an ID token.",
                ])
            }
            try await exchange(idToken: idToken)
        } catch {
            lastError = error.localizedDescription
        }
        isSigningIn = false
    }

    func signOut() {
        GIDSignIn.sharedInstance.signOut()
        KeychainStore.clearAll()
        sessionToken = nil
        athleteId = nil
        email = nil
        displayName = nil
    }

    private func exchange(idToken: String) async throws {
        let trimmed = apiUrl.hasSuffix("/") ? String(apiUrl.dropLast()) : apiUrl
        guard let url = URL(string: "\(trimmed)/api/auth/google") else {
            throw URLError(.badURL)
        }
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONSerialization.data(withJSONObject: ["credential": idToken])

        let (data, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse else {
            throw URLError(.badServerResponse)
        }
        let body = (try? JSONSerialization.jsonObject(with: data) as? [String: Any]) ?? [:]
        guard (200..<300).contains(http.statusCode) else {
            let msg = (body["error"] as? String) ?? "HTTP \(http.statusCode)"
            throw NSError(domain: "AuthManager", code: http.statusCode, userInfo: [
                NSLocalizedDescriptionKey: msg,
            ])
        }
        guard let token = body["token"] as? String,
              let athlete = body["athleteId"] as? String else {
            throw NSError(domain: "AuthManager", code: 2, userInfo: [
                NSLocalizedDescriptionKey: "Server response missing token or athleteId.",
            ])
        }
        let mail = body["email"] as? String ?? ""
        let name = body["name"] as? String ?? ""

        KeychainStore.set("session_token", token)
        KeychainStore.set("athlete_id", athlete)
        KeychainStore.set("email", mail)
        KeychainStore.set("display_name", name)

        self.sessionToken = token
        self.athleteId = athlete
        self.email = mail
        self.displayName = name
    }
}
