import Foundation
import HealthKit

struct DailyHealth: Identifiable {
    var id: String { date }
    let date: String
    let hrv: Double?
    let rhr: Int?
    let sleepHours: Double?
    let sleepSeconds: Int?
    let deepSeconds: Int?
    let remSeconds: Int?
    let lightSeconds: Int?
    let awakeSeconds: Int?
}

@MainActor
class HealthManager: ObservableObject {
    private let store = HKHealthStore()
    private var athleteId: String = ""
    private var apiUrl: String = ""

    @Published var isAuthorized = false
    @Published var isSyncing = false
    @Published var lastSyncDate: Date?
    @Published var lastError: String?
    @Published var todayData: DailyHealth?

    func configure(athleteId: String, apiUrl: String) {
        self.athleteId = athleteId
        self.apiUrl = apiUrl.hasSuffix("/") ? String(apiUrl.dropLast()) : apiUrl
    }

    func disconnect() {
        athleteId = ""
        apiUrl = ""
        isAuthorized = false
        lastSyncDate = nil
        todayData = nil
    }

    func requestAuthorization() {
        guard HKHealthStore.isHealthDataAvailable() else {
            lastError = "HealthKit not available on this device"
            return
        }

        let readTypes: Set<HKObjectType> = [
            HKQuantityType(.heartRateVariabilitySDNN),
            HKQuantityType(.restingHeartRate),
            HKCategoryType(.sleepAnalysis),
        ]

        store.requestAuthorization(toShare: nil, read: readTypes) { [weak self] success, error in
            Task { @MainActor in
                if success {
                    self?.isAuthorized = true
                    self?.lastError = nil
                    await self?.syncNow()
                } else {
                    self?.lastError = error?.localizedDescription ?? "Authorization denied"
                }
            }
        }
    }

    func syncNow() async {
        guard !athleteId.isEmpty, !apiUrl.isEmpty else { return }
        isSyncing = true
        lastError = nil

        do {
            let calendar = Calendar.current
            let today = calendar.startOfDay(for: Date())
            let weekAgo = calendar.date(byAdding: .day, value: -7, to: today)!
            let tomorrow = calendar.date(byAdding: .day, value: 1, to: today)!

            async let hrvMap = fetchHRVByDay(from: weekAgo, to: tomorrow)
            async let rhrMap = fetchRHRByDay(from: weekAgo, to: tomorrow)
            async let sleepMap = fetchSleepByDay(from: weekAgo, to: tomorrow)

            let hrv = try await hrvMap
            let rhr = try await rhrMap
            let sleep = try await sleepMap

            var allDates = Set<String>()
            allDates.formUnion(hrv.keys)
            allDates.formUnion(rhr.keys)
            allDates.formUnion(sleep.keys)

            var records: [[String: Any]] = []
            let todayStr = Self.formatDate(today)

            for dateStr in allDates.sorted() {
                let s = sleep[dateStr]
                var record: [String: Any] = ["date": dateStr]
                if let h = hrv[dateStr] { record["hrv"] = h }
                if let r = rhr[dateStr] { record["rhr"] = r }
                if let s {
                    record["sleepSeconds"] = s.total
                    record["deepSeconds"] = s.deep
                    record["remSeconds"] = s.rem
                    record["lightSeconds"] = s.light
                    record["awakeSeconds"] = s.awake
                }
                records.append(record)

                if dateStr == todayStr {
                    todayData = DailyHealth(
                        date: dateStr,
                        hrv: hrv[dateStr],
                        rhr: rhr[dateStr],
                        sleepHours: s.map { Double($0.total) / 3600.0 },
                        sleepSeconds: s?.total,
                        deepSeconds: s?.deep,
                        remSeconds: s?.rem,
                        lightSeconds: s?.light,
                        awakeSeconds: s?.awake
                    )
                }
            }

            if !records.isEmpty {
                try await uploadRecords(records)
                lastSyncDate = Date()
            } else {
                lastError = "No HealthKit data found for the last 7 days. Make sure your Apple Watch has synced."
            }
        } catch {
            lastError = error.localizedDescription
        }

        isSyncing = false
    }

    // MARK: - HRV (averaged across all samples per day)

    private func fetchHRVByDay(from start: Date, to end: Date) async throws -> [String: Double] {
        let type = HKQuantityType(.heartRateVariabilitySDNN)
        let unit = HKUnit.secondUnit(with: .milli)
        let samples = try await fetchQuantitySamples(type: type, start: start, end: end)

        var byDay: [String: [Double]] = [:]
        for s in samples {
            let day = Self.formatDate(s.startDate)
            byDay[day, default: []].append(s.quantity.doubleValue(for: unit))
        }
        return byDay.mapValues { values in
            round((values.reduce(0, +) / Double(values.count)) * 10) / 10
        }
    }

    // MARK: - RHR (averaged across all samples per day)

    private func fetchRHRByDay(from start: Date, to end: Date) async throws -> [String: Int] {
        let type = HKQuantityType(.restingHeartRate)
        let unit = HKUnit.count().unitDivided(by: .minute())
        let samples = try await fetchQuantitySamples(type: type, start: start, end: end)

        var byDay: [String: [Double]] = [:]
        for s in samples {
            let day = Self.formatDate(s.startDate)
            byDay[day, default: []].append(s.quantity.doubleValue(for: unit))
        }
        return byDay.mapValues { values in
            Int(round(values.reduce(0, +) / Double(values.count)))
        }
    }

    // MARK: - Sleep (bucketed by wake-up day to avoid cross-midnight double-counting)

    struct SleepData {
        let total: Int
        let deep: Int
        let rem: Int
        let light: Int
        let awake: Int
    }

    private func fetchSleepByDay(from start: Date, to end: Date) async throws -> [String: SleepData] {
        let type = HKCategoryType(.sleepAnalysis)
        let samples = try await fetchCategorySamples(type: type, start: start, end: end)

        var byDay: [String: (total: Int, deep: Int, rem: Int, light: Int, awake: Int)] = [:]
        for sample in samples {
            let day = Self.formatDate(sample.endDate)
            let duration = Int(sample.endDate.timeIntervalSince(sample.startDate))
            guard duration > 0 else { continue }

            var bucket = byDay[day] ?? (0, 0, 0, 0, 0)
            switch sample.value {
            case HKCategoryValueSleepAnalysis.asleepDeep.rawValue:
                bucket.deep += duration
                bucket.total += duration
            case HKCategoryValueSleepAnalysis.asleepREM.rawValue:
                bucket.rem += duration
                bucket.total += duration
            case HKCategoryValueSleepAnalysis.asleepCore.rawValue,
                 HKCategoryValueSleepAnalysis.asleepUnspecified.rawValue:
                bucket.light += duration
                bucket.total += duration
            case HKCategoryValueSleepAnalysis.awake.rawValue:
                bucket.awake += duration
            default:
                break
            }
            byDay[day] = bucket
        }

        return byDay.compactMapValues { v in
            v.total > 0 ? SleepData(total: v.total, deep: v.deep, rem: v.rem, light: v.light, awake: v.awake) : nil
        }
    }

    // MARK: - Generic HealthKit queries

    private func fetchQuantitySamples(type: HKQuantityType, start: Date, end: Date) async throws -> [HKQuantitySample] {
        let predicate = HKQuery.predicateForSamples(withStart: start, end: end)
        return try await withCheckedThrowingContinuation { cont in
            let query = HKSampleQuery(sampleType: type, predicate: predicate, limit: HKObjectQueryNoLimit, sortDescriptors: nil) { _, samples, error in
                if let error { cont.resume(throwing: error); return }
                cont.resume(returning: (samples as? [HKQuantitySample]) ?? [])
            }
            store.execute(query)
        }
    }

    private func fetchCategorySamples(type: HKCategoryType, start: Date, end: Date) async throws -> [HKCategorySample] {
        let predicate = HKQuery.predicateForSamples(withStart: start, end: end)
        return try await withCheckedThrowingContinuation { cont in
            let query = HKSampleQuery(sampleType: type, predicate: predicate, limit: HKObjectQueryNoLimit, sortDescriptors: nil) { _, samples, error in
                if let error { cont.resume(throwing: error); return }
                cont.resume(returning: (samples as? [HKCategorySample]) ?? [])
            }
            store.execute(query)
        }
    }

    // MARK: - Upload

    private func uploadRecords(_ records: [[String: Any]]) async throws {
        guard var comps = URLComponents(string: "\(apiUrl)/api/apple/health") else {
            throw URLError(.badURL)
        }
        comps.queryItems = [URLQueryItem(name: "athlete", value: athleteId)]
        guard let url = comps.url else {
            throw URLError(.badURL)
        }

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONSerialization.data(withJSONObject: ["records": records])

        let (data, response) = try await URLSession.shared.data(for: request)

        guard let httpResponse = response as? HTTPURLResponse, (200..<300).contains(httpResponse.statusCode) else {
            let body = String(data: data, encoding: .utf8) ?? "Unknown error"
            throw NSError(domain: "BrokenArrowHealth", code: 1, userInfo: [NSLocalizedDescriptionKey: "Upload failed: \(body)"])
        }
    }

    // MARK: - Helpers

    private static let dateFormatter: DateFormatter = {
        let f = DateFormatter()
        f.dateFormat = "yyyy-MM-dd"
        f.locale = Locale(identifier: "en_US_POSIX")
        f.timeZone = TimeZone.current
        return f
    }()

    static func formatDate(_ date: Date) -> String {
        dateFormatter.string(from: date)
    }
}
