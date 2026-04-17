import Foundation
import HealthKit
import Combine

struct DailyHealth {
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
        self.apiUrl = apiUrl
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
            HKQuantityType(.heartRate),
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
            // Fetch last 7 days of data
            var records: [[String: Any]] = []
            let calendar = Calendar.current

            for daysAgo in 0..<7 {
                let date = calendar.date(byAdding: .day, value: -daysAgo, to: Date())!
                let dateStr = formatDate(date)
                let startOfDay = calendar.startOfDay(for: date)
                let endOfDay = calendar.date(byAdding: .day, value: 1, to: startOfDay)!

                let hrv = try await fetchLatestQuantity(.heartRateVariabilitySDNN, start: startOfDay, end: endOfDay, unit: .secondUnit(with: .milli))
                let rhr = try await fetchLatestQuantity(.restingHeartRate, start: startOfDay, end: endOfDay, unit: HKUnit.count().unitDivided(by: .minute()))
                let sleep = try await fetchSleep(start: startOfDay, end: endOfDay)

                var record: [String: Any] = ["date": dateStr]
                if let hrv = hrv { record["hrv"] = hrv }
                if let rhr = rhr { record["rhr"] = Int(rhr) }
                if let sleep = sleep {
                    record["sleepSeconds"] = sleep.total
                    record["deepSeconds"] = sleep.deep
                    record["remSeconds"] = sleep.rem
                    record["lightSeconds"] = sleep.light
                    record["awakeSeconds"] = sleep.awake
                }

                if hrv != nil || rhr != nil || sleep != nil {
                    records.append(record)
                }

                if daysAgo == 0 {
                    todayData = DailyHealth(
                        date: dateStr,
                        hrv: hrv,
                        rhr: rhr != nil ? Int(rhr!) : nil,
                        sleepHours: sleep.map { Double($0.total) / 3600.0 },
                        sleepSeconds: sleep?.total,
                        deepSeconds: sleep?.deep,
                        remSeconds: sleep?.rem,
                        lightSeconds: sleep?.light,
                        awakeSeconds: sleep?.awake
                    )
                }
            }

            if !records.isEmpty {
                try await uploadRecords(records)
                lastSyncDate = Date()
            }
        } catch {
            lastError = error.localizedDescription
        }

        isSyncing = false
    }

    // MARK: - HealthKit Queries

    private func fetchLatestQuantity(_ type: HKQuantityTypeIdentifier, start: Date, end: Date, unit: HKUnit) async throws -> Double? {
        let quantityType = HKQuantityType(type)
        let predicate = HKQuery.predicateForSamples(withStart: start, end: end)
        let sortDescriptor = NSSortDescriptor(key: HKSampleSortIdentifierStartDate, ascending: false)

        return try await withCheckedThrowingContinuation { continuation in
            let query = HKSampleQuery(sampleType: quantityType, predicate: predicate, limit: 1, sortDescriptors: [sortDescriptor]) { _, samples, error in
                if let error = error {
                    continuation.resume(throwing: error)
                    return
                }
                if let sample = samples?.first as? HKQuantitySample {
                    continuation.resume(returning: sample.quantity.doubleValue(for: unit))
                } else {
                    continuation.resume(returning: nil)
                }
            }
            store.execute(query)
        }
    }

    struct SleepData {
        let total: Int
        let deep: Int
        let rem: Int
        let light: Int
        let awake: Int
    }

    private func fetchSleep(start: Date, end: Date) async throws -> SleepData? {
        let sleepType = HKCategoryType(.sleepAnalysis)
        let predicate = HKQuery.predicateForSamples(withStart: start, end: end)

        return try await withCheckedThrowingContinuation { continuation in
            let query = HKSampleQuery(sampleType: sleepType, predicate: predicate, limit: HKObjectQueryNoLimit, sortDescriptors: nil) { _, samples, error in
                if let error = error {
                    continuation.resume(throwing: error)
                    return
                }

                guard let categorySamples = samples as? [HKCategorySample], !categorySamples.isEmpty else {
                    continuation.resume(returning: nil)
                    return
                }

                var deep = 0, rem = 0, light = 0, awake = 0, asleep = 0

                for sample in categorySamples {
                    let duration = Int(sample.endDate.timeIntervalSince(sample.startDate))
                    switch sample.value {
                    case HKCategoryValueSleepAnalysis.asleepDeep.rawValue:
                        deep += duration
                    case HKCategoryValueSleepAnalysis.asleepREM.rawValue:
                        rem += duration
                    case HKCategoryValueSleepAnalysis.asleepCore.rawValue:
                        light += duration
                    case HKCategoryValueSleepAnalysis.awake.rawValue:
                        awake += duration
                    case HKCategoryValueSleepAnalysis.asleepUnspecified.rawValue:
                        asleep += duration
                    default:
                        break
                    }
                }

                let total = deep + rem + light + asleep
                if total > 0 {
                    continuation.resume(returning: SleepData(total: total, deep: deep, rem: rem, light: light, awake: awake))
                } else {
                    continuation.resume(returning: nil)
                }
            }
            store.execute(query)
        }
    }

    // MARK: - API Upload

    private func uploadRecords(_ records: [[String: Any]]) async throws {
        let urlString = "\(apiUrl)/api/apple/health?athlete=\(athleteId)"
        guard let url = URL(string: urlString) else {
            throw URLError(.badURL)
        }

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONSerialization.data(withJSONObject: ["records": records])

        let (data, response) = try await URLSession.shared.data(for: request)

        guard let httpResponse = response as? HTTPURLResponse, httpResponse.statusCode == 200 else {
            let body = String(data: data, encoding: .utf8) ?? "Unknown error"
            throw NSError(domain: "BrokenArrowHealth", code: 1, userInfo: [NSLocalizedDescriptionKey: "Upload failed: \(body)"])
        }
    }

    // MARK: - Helpers

    private func formatDate(_ date: Date) -> String {
        let formatter = DateFormatter()
        formatter.dateFormat = "yyyy-MM-dd"
        formatter.timeZone = TimeZone.current
        return formatter.string(from: date)
    }
}
