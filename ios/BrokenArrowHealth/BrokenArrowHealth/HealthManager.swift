import Foundation
import HealthKit

@MainActor
final class HealthManager: ObservableObject {
    enum SyncState: Equatable {
        case idle
        case authorizing
        case querying
        case uploading
        case success(stored: Int, at: Date)
        case failure(String)
    }

    @Published var authorized = false
    @Published var state: SyncState = .idle

    @Published var lastRecordsPreview: [HealthRecord] = []

    private let store = HKHealthStore()

    private var readTypes: Set<HKObjectType> {
        var types: Set<HKObjectType> = []
        if let hrv = HKObjectType.quantityType(forIdentifier: .heartRateVariabilitySDNN) {
            types.insert(hrv)
        }
        if let rhr = HKObjectType.quantityType(forIdentifier: .restingHeartRate) {
            types.insert(rhr)
        }
        if let sleep = HKObjectType.categoryType(forIdentifier: .sleepAnalysis) {
            types.insert(sleep)
        }
        return types
    }

    func requestAuthorization() async {
        guard HKHealthStore.isHealthDataAvailable() else {
            state = .failure("HealthKit unavailable on this device.")
            return
        }
        state = .authorizing
        do {
            try await store.requestAuthorization(toShare: [], read: readTypes)
            authorized = true
            state = .idle
        } catch {
            state = .failure("Authorization failed: \(error.localizedDescription)")
        }
    }

    func syncLastSevenDays(athlete: String, apiURL: String) async {
        guard !athlete.isEmpty, !apiURL.isEmpty else {
            state = .failure("Set athlete ID and API URL first.")
            return
        }

        state = .querying
        let cal = Calendar.current
        let today = cal.startOfDay(for: Date())
        let end = cal.date(byAdding: .day, value: 1, to: today) ?? today
        let start = cal.date(byAdding: .day, value: -7, to: today) ?? today

        do {
            async let hrv = hrvByDay(from: start, to: end)
            async let rhr = rhrByDay(from: start, to: end)
            async let sleep = sleepByDay(from: start, to: end)

            let hrvMap = try await hrv
            let rhrMap = try await rhr
            let sleepMap = try await sleep

            var dates = Set<String>()
            dates.formUnion(hrvMap.keys)
            dates.formUnion(rhrMap.keys)
            dates.formUnion(sleepMap.keys)

            let records: [HealthRecord] = dates.sorted().map { date in
                let sleep = sleepMap[date]
                return HealthRecord(
                    date: date,
                    hrv: hrvMap[date],
                    rhr: rhrMap[date],
                    sleepSeconds: sleep?.total,
                    deepSeconds: sleep?.deep,
                    remSeconds: sleep?.rem,
                    lightSeconds: sleep?.light,
                    awakeSeconds: sleep?.awake
                )
            }

            lastRecordsPreview = records

            if records.isEmpty {
                state = .failure("No HealthKit data found for the last 7 days. Make sure your Apple Watch has synced.")
                return
            }

            state = .uploading
            let stored = try await upload(records: records, athlete: athlete, apiURL: apiURL)
            state = .success(stored: stored, at: Date())
        } catch {
            state = .failure(error.localizedDescription)
        }
    }

    private func hrvByDay(from start: Date, to end: Date) async throws -> [String: Double] {
        guard let type = HKQuantityType.quantityType(forIdentifier: .heartRateVariabilitySDNN) else {
            return [:]
        }
        let samples = try await fetchQuantitySamples(type: type, start: start, end: end)
        let unit = HKUnit.secondUnit(with: .milli)
        var byDay: [String: [Double]] = [:]
        for s in samples {
            let day = Self.isoDay(s.startDate)
            byDay[day, default: []].append(s.quantity.doubleValue(for: unit))
        }
        return byDay.mapValues { round(($0.reduce(0, +) / Double($0.count)) * 10) / 10 }
    }

    private func rhrByDay(from start: Date, to end: Date) async throws -> [String: Int] {
        guard let type = HKQuantityType.quantityType(forIdentifier: .restingHeartRate) else {
            return [:]
        }
        let samples = try await fetchQuantitySamples(type: type, start: start, end: end)
        let unit = HKUnit.count().unitDivided(by: .minute())
        var byDay: [String: [Double]] = [:]
        for s in samples {
            let day = Self.isoDay(s.startDate)
            byDay[day, default: []].append(s.quantity.doubleValue(for: unit))
        }
        return byDay.mapValues { Int(round($0.reduce(0, +) / Double($0.count))) }
    }

    struct SleepBreakdown {
        let total: Int
        let deep: Int
        let rem: Int
        let light: Int
        let awake: Int
    }

    private func sleepByDay(from start: Date, to end: Date) async throws -> [String: SleepBreakdown] {
        guard let type = HKCategoryType.categoryType(forIdentifier: .sleepAnalysis) else {
            return [:]
        }
        let samples = try await fetchCategorySamples(type: type, start: start, end: end)

        // Attribute a sleep session to the day you woke up on (endDate).
        var byDay: [String: (total: Double, deep: Double, rem: Double, light: Double, awake: Double)] = [:]
        for s in samples {
            let day = Self.isoDay(s.endDate)
            let seconds = s.endDate.timeIntervalSince(s.startDate)
            guard seconds > 0 else { continue }
            var bucket = byDay[day] ?? (0, 0, 0, 0, 0)
            switch s.value {
            case HKCategoryValueSleepAnalysis.asleepDeep.rawValue:
                bucket.deep += seconds
                bucket.total += seconds
            case HKCategoryValueSleepAnalysis.asleepREM.rawValue:
                bucket.rem += seconds
                bucket.total += seconds
            case HKCategoryValueSleepAnalysis.asleepCore.rawValue,
                 HKCategoryValueSleepAnalysis.asleep.rawValue,
                 HKCategoryValueSleepAnalysis.asleepUnspecified.rawValue:
                bucket.light += seconds
                bucket.total += seconds
            case HKCategoryValueSleepAnalysis.awake.rawValue:
                bucket.awake += seconds
            default:
                break
            }
            byDay[day] = bucket
        }

        return byDay.mapValues { v in
            SleepBreakdown(
                total: Int(v.total),
                deep: Int(v.deep),
                rem: Int(v.rem),
                light: Int(v.light),
                awake: Int(v.awake)
            )
        }
    }

    private func fetchQuantitySamples(type: HKQuantityType, start: Date, end: Date) async throws -> [HKQuantitySample] {
        let predicate = HKQuery.predicateForSamples(withStart: start, end: end, options: [])
        return try await withCheckedThrowingContinuation { cont in
            let q = HKSampleQuery(
                sampleType: type,
                predicate: predicate,
                limit: HKObjectQueryNoLimit,
                sortDescriptors: nil
            ) { _, samples, err in
                if let err { cont.resume(throwing: err); return }
                cont.resume(returning: (samples as? [HKQuantitySample]) ?? [])
            }
            store.execute(q)
        }
    }

    private func fetchCategorySamples(type: HKCategoryType, start: Date, end: Date) async throws -> [HKCategorySample] {
        let predicate = HKQuery.predicateForSamples(withStart: start, end: end, options: [])
        return try await withCheckedThrowingContinuation { cont in
            let q = HKSampleQuery(
                sampleType: type,
                predicate: predicate,
                limit: HKObjectQueryNoLimit,
                sortDescriptors: nil
            ) { _, samples, err in
                if let err { cont.resume(throwing: err); return }
                cont.resume(returning: (samples as? [HKCategorySample]) ?? [])
            }
            store.execute(q)
        }
    }

    private func upload(records: [HealthRecord], athlete: String, apiURL: String) async throws -> Int {
        let base = apiURL.hasSuffix("/") ? String(apiURL.dropLast()) : apiURL
        guard var comps = URLComponents(string: "\(base)/api/apple/health") else {
            throw NSError(domain: "BrokenArrow", code: 1, userInfo: [NSLocalizedDescriptionKey: "Invalid API URL."])
        }
        comps.queryItems = [URLQueryItem(name: "athlete", value: athlete)]
        guard let url = comps.url else {
            throw NSError(domain: "BrokenArrow", code: 2, userInfo: [NSLocalizedDescriptionKey: "Could not build URL."])
        }

        var req = URLRequest(url: url)
        req.httpMethod = "POST"
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.httpBody = try JSONEncoder().encode(UploadPayload(records: records))

        let (data, resp) = try await URLSession.shared.data(for: req)
        guard let http = resp as? HTTPURLResponse else {
            throw NSError(domain: "BrokenArrow", code: 3, userInfo: [NSLocalizedDescriptionKey: "No HTTP response."])
        }
        guard (200..<300).contains(http.statusCode) else {
            let msg = String(data: data, encoding: .utf8) ?? "HTTP \(http.statusCode)"
            throw NSError(domain: "BrokenArrow", code: http.statusCode, userInfo: [NSLocalizedDescriptionKey: msg])
        }
        let decoded = try JSONDecoder().decode(UploadResponse.self, from: data)
        return decoded.stored
    }

    private static let isoFormatter: DateFormatter = {
        let f = DateFormatter()
        f.calendar = Calendar(identifier: .gregorian)
        f.locale = Locale(identifier: "en_US_POSIX")
        f.timeZone = TimeZone.current
        f.dateFormat = "yyyy-MM-dd"
        return f
    }()

    static func isoDay(_ date: Date) -> String {
        isoFormatter.string(from: date)
    }
}

struct HealthRecord: Codable, Identifiable {
    var id: String { date }
    let date: String
    let hrv: Double?
    let rhr: Int?
    let sleepSeconds: Int?
    let deepSeconds: Int?
    let remSeconds: Int?
    let lightSeconds: Int?
    let awakeSeconds: Int?
}

private struct UploadPayload: Codable {
    let records: [HealthRecord]
}

private struct UploadResponse: Codable {
    let ok: Bool
    let stored: Int
}
