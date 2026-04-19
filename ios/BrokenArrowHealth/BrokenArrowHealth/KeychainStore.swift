import Foundation
import Security

/// Minimal Keychain wrapper for storing the server-issued session JWT
/// (and related profile metadata). We avoid UserDefaults for these
/// fields because UserDefaults is not secure-at-rest and may sync to
/// iCloud on some configurations. Keychain items here are device-only
/// (`kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly`).
enum KeychainStore {
    private static let service = "com.brokenarrow.health"

    static func set(_ key: String, _ value: String?) {
        var query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: key,
        ]

        if let value = value, let data = value.data(using: .utf8) {
            // Upsert: delete any existing item, then add fresh.
            SecItemDelete(query as CFDictionary)
            query[kSecValueData as String] = data
            query[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
            SecItemAdd(query as CFDictionary, nil)
        } else {
            SecItemDelete(query as CFDictionary)
        }
    }

    static func get(_ key: String) -> String? {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: key,
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne,
        ]
        var result: AnyObject?
        let status = SecItemCopyMatching(query as CFDictionary, &result)
        guard status == errSecSuccess,
              let data = result as? Data,
              let str = String(data: data, encoding: .utf8) else {
            return nil
        }
        return str
    }

    static func clearAll() {
        for k in ["session_token", "athlete_id", "email", "display_name"] {
            set(k, nil)
        }
    }
}
