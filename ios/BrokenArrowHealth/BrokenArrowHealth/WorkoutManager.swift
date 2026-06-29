import Foundation
import HealthKit
import CoreLocation

/// Reads completed Apple Watch workouts from HealthKit and uploads them to the
/// Broken Arrow backend (`PUT /api/apple/health`) in a shape the web app
/// normalizes to `GarminActivity`. For outdoor workouts it derives the
/// steep-descent vertical (grade ≤ −10%) on-device from the workout route —
/// the one quantity that drives the readiness DOMS / load-dampening engine —
/// so the heavy per-second math stays in one place (mirrors the web's
/// `eccentric.ts` HARD_GRADE definition) and the payload stays tiny.
///
/// Authorization is requested by `HealthManager.requestAuthorization()` (one
/// combined HealthKit sheet), so this class only reads.
@MainActor
final class WorkoutManager: ObservableObject {
    private let store = HKHealthStore()
    private var apiUrl: String = ""
    private var sessionToken: String = ""
    /// Retained so ARC doesn't release the background observer.
    private var observerQueries: [HKObserverQuery] = []

    @Published var isSyncing = false
    @Published var lastSyncDate: Date?
    @Published var lastError: String?

    func configure(apiUrl: String, sessionToken: String) {
        self.apiUrl = apiUrl.hasSuffix("/") ? String(apiUrl.dropLast()) : apiUrl
        self.sessionToken = sessionToken
    }

    /// Restore apiUrl + token without the SwiftUI view graph (background relaunch).
    func configureFromKeychain() {
        let url = UserDefaults.standard.string(forKey: "apiUrl") ?? ""
        let token = KeychainStore.get("session_token") ?? ""
        if !url.isEmpty, !token.isEmpty {
            configure(apiUrl: url, sessionToken: token)
        }
    }

    func disconnect() {
        apiUrl = ""
        sessionToken = ""
        lastSyncDate = nil
        for q in observerQueries { store.stop(q) }
        observerQueries.removeAll()
    }

    // MARK: - Sync

    /// Fetch workouts in the trailing window, normalize, and upload. The first
    /// sync after sign-in passes a wide `daysBack` to back-fill history; the
    /// background observer passes a small one for incremental updates. Re-uploads
    /// are idempotent server-side (keyed by the HKWorkout UUID).
    func syncWorkouts(daysBack: Int = 30) async {
        guard !apiUrl.isEmpty, !sessionToken.isEmpty else { return }
        isSyncing = true
        defer { isSyncing = false }
        do {
            let cal = Calendar.current
            let end = Date()
            let start = cal.date(byAdding: .day, value: -daysBack, to: cal.startOfDay(for: end)) ?? end
            let workouts = try await fetchWorkouts(from: start, to: end)
            var payload: [[String: Any]] = []
            for w in workouts {
                payload.append(await workoutRecord(w))
            }
            if !payload.isEmpty {
                try await upload(payload)
                lastSyncDate = Date()
                lastError = nil
            }
        } catch {
            lastError = error.localizedDescription
        }
    }

    // MARK: - Background delivery

    func enableBackgroundDelivery() {
        guard HKHealthStore.isHealthDataAvailable() else { return }
        // Workouts support `.immediate` delivery (unlike throttled quantity types).
        store.enableBackgroundDelivery(for: .workoutType(), frequency: .immediate) { _, _ in }
    }

    func startObservers() {
        guard HKHealthStore.isHealthDataAvailable() else { return }
        for q in observerQueries { store.stop(q) }
        observerQueries.removeAll()
        let query = HKObserverQuery(sampleType: .workoutType(), predicate: nil) { [weak self] _, completionHandler, error in
            guard error == nil else { completionHandler(); return }
            Task { @MainActor in
                self?.configureFromKeychain()
                await self?.syncWorkouts(daysBack: 14)
                completionHandler()   // must always call or iOS stops delivering
            }
        }
        store.execute(query)
        observerQueries.append(query)
    }

    // MARK: - Workout → upload record

    private func workoutRecord(_ w: HKWorkout) async -> [String: Any] {
        let sport = Self.sportString(w.workoutActivityType)
        var record: [String: Any] = [
            "activityId": w.uuid.uuidString,
            "startTimeMs": Int(w.startDate.timeIntervalSince1970 * 1000),
            "date": Self.formatDate(w.startDate),
            "name": Self.workoutName(w, sport: sport),
            "sport": sport,
            "durationSeconds": Int(w.duration),
        ]
        if let dist = Self.distanceMeters(w) { record["distanceMeters"] = dist }
        if let kcal = Self.activeEnergyKcal(w) { record["activeEnergyKcal"] = kcal }
        if let hr = await heartRate(w) {
            if let avg = hr.avg { record["avgHR"] = avg }
            if let mx = hr.max { record["maxHR"] = mx }
        }
        if let asc = (w.metadata?[HKMetadataKeyElevationAscended] as? HKQuantity)?.doubleValue(for: .meter()) {
            record["elevationGainMeters"] = asc
        }
        // Steep-descent vertical, computed on-device from the route. 0 when
        // there's no route (indoor/treadmill) — the web treats that as "no
        // descent" and applies no DOMS dampening.
        record["hardDescentVerticalMeters"] = await hardDescentVerticalMeters(w)
        return record
    }

    // MARK: - HealthKit queries

    private func fetchWorkouts(from: Date, to: Date) async throws -> [HKWorkout] {
        let predicate = HKQuery.predicateForSamples(withStart: from, end: to)
        return try await withCheckedThrowingContinuation { cont in
            let q = HKSampleQuery(
                sampleType: .workoutType(),
                predicate: predicate,
                limit: HKObjectQueryNoLimit,
                sortDescriptors: nil
            ) { _, samples, error in
                if let error { cont.resume(throwing: error); return }
                cont.resume(returning: (samples as? [HKWorkout]) ?? [])
            }
            store.execute(q)
        }
    }

    /// Avg/max HR over the workout interval via a scoped statistics query.
    private func heartRate(_ w: HKWorkout) async -> (avg: Int?, max: Int?)? {
        let type = HKQuantityType(.heartRate)
        let pred = HKQuery.predicateForSamples(withStart: w.startDate, end: w.endDate)
        let unit = HKUnit.count().unitDivided(by: .minute())
        return await withCheckedContinuation { cont in
            let q = HKStatisticsQuery(
                quantityType: type,
                quantitySamplePredicate: pred,
                options: [.discreteAverage, .discreteMax]
            ) { _, stats, _ in
                let avg = stats?.averageQuantity()?.doubleValue(for: unit)
                let mx = stats?.maximumQuantity()?.doubleValue(for: unit)
                cont.resume(returning: (avg.map { Int($0.rounded()) }, mx.map { Int($0.rounded()) }))
            }
            store.execute(q)
        }
    }

    /// Sum of altitude drops over segments steeper than −10% grade. Mirrors
    /// `computeEccentricLoad` (`src/engines/descent/eccentric.ts`, HARD_GRADE).
    private func hardDescentVerticalMeters(_ w: HKWorkout) async -> Double {
        guard let locations = await routeLocations(w), locations.count > 1 else { return 0 }
        var hardDescent = 0.0
        for i in 1..<locations.count {
            let prev = locations[i - 1]
            let cur = locations[i]
            let dDist = cur.distance(from: prev)        // horizontal meters between fixes
            let dAlt = cur.altitude - prev.altitude     // meters (negative on descent)
            guard dDist > 0.5 else { continue }          // ignore stationary GPS noise
            if dAlt / dDist <= -0.10 { hardDescent += -dAlt }
        }
        return (hardDescent * 10).rounded() / 10
    }

    private func routeLocations(_ w: HKWorkout) async -> [CLLocation]? {
        let routes: [HKWorkoutRoute] = await withCheckedContinuation { cont in
            let pred = HKQuery.predicateForObjects(from: w)
            let q = HKSampleQuery(
                sampleType: HKSeriesType.workoutRoute(),
                predicate: pred,
                limit: HKObjectQueryNoLimit,
                sortDescriptors: nil
            ) { _, samples, _ in
                cont.resume(returning: (samples as? [HKWorkoutRoute]) ?? [])
            }
            store.execute(q)
        }
        guard !routes.isEmpty else { return nil }
        var all: [CLLocation] = []
        for route in routes {
            all.append(contentsOf: await locations(for: route))
        }
        all.sort { $0.timestamp < $1.timestamp }
        return all.isEmpty ? nil : all
    }

    private func locations(for route: HKWorkoutRoute) async -> [CLLocation] {
        await withCheckedContinuation { cont in
            var collected: [CLLocation] = []
            let q = HKWorkoutRouteQuery(route: route) { _, locationsOrNil, done, _ in
                if let locs = locationsOrNil { collected.append(contentsOf: locs) }
                // On error HealthKit also reports done == true, so resuming on
                // `done` alone is single-resume-safe.
                if done { cont.resume(returning: collected) }
            }
            store.execute(q)
        }
    }

    // MARK: - Upload

    private func upload(_ workouts: [[String: Any]]) async throws {
        guard let url = URL(string: "\(apiUrl)/api/apple/health") else { throw URLError(.badURL) }
        var req = URLRequest(url: url)
        req.httpMethod = "PUT"
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.setValue("Bearer \(sessionToken)", forHTTPHeaderField: "Authorization")
        req.httpBody = try JSONSerialization.data(withJSONObject: ["workouts": workouts])

        let (data, response) = try await URLSession.shared.data(for: req)
        guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode) else {
            let body = String(data: data, encoding: .utf8) ?? "Unknown error"
            throw NSError(domain: "WorkoutManager", code: 1, userInfo: [NSLocalizedDescriptionKey: "Workout upload failed: \(body)"])
        }
    }

    // MARK: - Helpers

    private static func distanceMeters(_ w: HKWorkout) -> Double? {
        for id in [HKQuantityTypeIdentifier.distanceWalkingRunning, .distanceCycling] {
            if let m = w.statistics(for: HKQuantityType(id))?.sumQuantity()?.doubleValue(for: .meter()), m > 0 {
                return m
            }
        }
        return w.totalDistance?.doubleValue(for: .meter())
    }

    private static func activeEnergyKcal(_ w: HKWorkout) -> Double? {
        if let kcal = w.statistics(for: HKQuantityType(.activeEnergyBurned))?.sumQuantity()?.doubleValue(for: .kilocalorie()), kcal > 0 {
            return kcal
        }
        return w.totalEnergyBurned?.doubleValue(for: .kilocalorie())
    }

    /// Map HKWorkoutActivityType → the lowercase sport strings the web's
    /// `mapToSportType` already understands (Apple has no trail-run type; it
    /// records trail runs as `.running`, which the web promotes via elevation).
    static func sportString(_ t: HKWorkoutActivityType) -> String {
        switch t {
        case .running: return "running"
        case .walking: return "walking"
        case .hiking: return "hiking"
        case .cycling: return "cycling"
        case .traditionalStrengthTraining, .functionalStrengthTraining: return "strength_training"
        case .highIntensityIntervalTraining: return "hiit"
        case .rowing: return "rowing"
        case .elliptical: return "elliptical"
        case .swimming: return "swimming"
        case .yoga: return "yoga"
        case .crossTraining: return "cross_training"
        default: return "other"
        }
    }

    static func workoutName(_ w: HKWorkout, sport: String) -> String {
        if let brand = w.metadata?[HKMetadataKeyWorkoutBrandName] as? String, !brand.isEmpty {
            return brand
        }
        return sport.replacingOccurrences(of: "_", with: " ").capitalized
    }

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
