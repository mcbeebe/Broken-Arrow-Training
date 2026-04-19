import SwiftUI

struct ContentView: View {
    @EnvironmentObject var health: HealthManager

    @AppStorage("athleteId") private var athleteId: String = ""
    @AppStorage("apiURL") private var apiURL: String = "https://broken-arrow-training.vercel.app"

    var body: some View {
        NavigationStack {
            Form {
                Section("Athlete") {
                    TextField("athlete id (e.g. mike)", text: $athleteId)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                }

                Section("Backend") {
                    TextField("API URL", text: $apiURL)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                        .keyboardType(.URL)
                }

                Section("HealthKit") {
                    if health.authorized {
                        Label("Authorized", systemImage: "checkmark.seal.fill")
                            .foregroundStyle(.green)
                    } else {
                        Button {
                            Task { await health.requestAuthorization() }
                        } label: {
                            Label("Grant HealthKit access", systemImage: "heart.text.square")
                        }
                    }
                }

                Section("Sync") {
                    Button {
                        Task {
                            await health.syncLastSevenDays(athlete: athleteId, apiURL: apiURL)
                        }
                    } label: {
                        HStack {
                            Image(systemName: "arrow.triangle.2.circlepath")
                            Text("Sync last 7 days")
                            Spacer()
                            if case .querying = health.state { ProgressView() }
                            if case .uploading = health.state { ProgressView() }
                        }
                    }
                    .disabled(isBusy || athleteId.isEmpty || apiURL.isEmpty || !health.authorized)

                    StateRow(state: health.state)
                }

                if !health.lastRecordsPreview.isEmpty {
                    Section("Last upload preview") {
                        ForEach(health.lastRecordsPreview) { r in
                            VStack(alignment: .leading, spacing: 2) {
                                Text(r.date).font(.headline)
                                HStack(spacing: 12) {
                                    if let hrv = r.hrv {
                                        Text("HRV \(hrv, specifier: "%.1f")")
                                    }
                                    if let rhr = r.rhr {
                                        Text("RHR \(rhr)")
                                    }
                                    if let s = r.sleepSeconds {
                                        Text("Sleep \(formatHours(s))")
                                    }
                                }
                                .font(.caption)
                                .foregroundStyle(.secondary)
                            }
                        }
                    }
                }
            }
            .navigationTitle("Broken Arrow Health")
        }
    }

    private var isBusy: Bool {
        switch health.state {
        case .authorizing, .querying, .uploading: return true
        default: return false
        }
    }

    private func formatHours(_ seconds: Int) -> String {
        let hours = Double(seconds) / 3600.0
        return String(format: "%.1fh", hours)
    }
}

private struct StateRow: View {
    let state: HealthManager.SyncState

    var body: some View {
        switch state {
        case .idle:
            Text("Idle").foregroundStyle(.secondary)
        case .authorizing:
            Text("Requesting HealthKit authorization…")
        case .querying:
            Text("Reading from HealthKit…")
        case .uploading:
            Text("Uploading to backend…")
        case .success(let n, let at):
            Label("Uploaded \(n) day\(n == 1 ? "" : "s") at \(at.formatted(date: .omitted, time: .shortened))", systemImage: "checkmark.circle.fill")
                .foregroundStyle(.green)
        case .failure(let msg):
            Label(msg, systemImage: "exclamationmark.triangle.fill")
                .foregroundStyle(.red)
        }
    }
}

#Preview {
    ContentView().environmentObject(HealthManager())
}
