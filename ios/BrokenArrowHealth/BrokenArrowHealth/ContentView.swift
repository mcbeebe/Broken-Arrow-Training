import SwiftUI

struct ContentView: View {
    @EnvironmentObject var health: HealthManager
    @AppStorage("athleteId") private var athleteId: String = ""
    @AppStorage("apiUrl") private var apiUrl: String = ""
    @State private var showSetup = false

    var body: some View {
        NavigationView {
            VStack(spacing: 20) {
                if athleteId.isEmpty || apiUrl.isEmpty {
                    setupView
                } else {
                    connectedView
                }
            }
            .padding()
            .navigationTitle("Broken Arrow Health")
        }
        .onAppear {
            if !athleteId.isEmpty && !apiUrl.isEmpty {
                health.configure(athleteId: athleteId, apiUrl: apiUrl)
                health.requestAuthorization()
            }
        }
    }

    private var setupView: some View {
        VStack(spacing: 16) {
            Image(systemName: "heart.text.square.fill")
                .font(.system(size: 60))
                .foregroundColor(.green)

            Text("Connect to Broken Arrow")
                .font(.title2).bold()

            Text("This app syncs your Apple Watch health data (HRV, resting HR, sleep) to the Broken Arrow training app.")
                .font(.subheadline)
                .foregroundColor(.secondary)
                .multilineTextAlignment(.center)

            VStack(spacing: 12) {
                TextField("Your athlete ID (e.g. lori)", text: $athleteId)
                    .textFieldStyle(.roundedBorder)
                    .autocapitalization(.none)
                    .disableAutocorrection(true)

                TextField("API URL", text: $apiUrl)
                    .textFieldStyle(.roundedBorder)
                    .autocapitalization(.none)
                    .disableAutocorrection(true)
                    .keyboardType(.URL)

                Text("Ask Mike for your athlete ID and API URL")
                    .font(.caption)
                    .foregroundColor(.secondary)
            }
            .padding(.horizontal)

            Button {
                health.configure(athleteId: athleteId, apiUrl: apiUrl)
                health.requestAuthorization()
            } label: {
                Text("Connect Apple Health")
                    .font(.headline)
                    .frame(maxWidth: .infinity)
                    .padding()
                    .background(Color.green)
                    .foregroundColor(.white)
                    .cornerRadius(12)
            }
            .disabled(athleteId.isEmpty || apiUrl.isEmpty)
            .padding(.horizontal)
        }
    }

    private var connectedView: some View {
        VStack(spacing: 16) {
            HStack {
                Circle()
                    .fill(health.lastSyncDate != nil ? Color.green : Color.orange)
                    .frame(width: 10, height: 10)
                Text(health.isAuthorized ? "Connected" : "Waiting for permissions...")
                    .font(.headline)
                Spacer()
            }

            Text("Athlete: \(athleteId)")
                .font(.subheadline)
                .foregroundColor(.secondary)
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

            Divider()

            if let today = health.todayData {
                VStack(alignment: .leading, spacing: 8) {
                    Text("Today's Data")
                        .font(.headline)

                    HStack(spacing: 20) {
                        statBox("HRV", value: today.hrv.map { String(format: "%.0f ms", $0) } ?? "—")
                        statBox("RHR", value: today.rhr.map { "\($0) bpm" } ?? "—")
                        statBox("Sleep", value: today.sleepHours.map { String(format: "%.1f hr", $0) } ?? "—")
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            }

            Spacer()

            Button {
                Task { await health.syncNow() }
            } label: {
                HStack {
                    if health.isSyncing {
                        ProgressView()
                            .tint(.white)
                    }
                    Text(health.isSyncing ? "Syncing..." : "Sync Now")
                }
                .font(.headline)
                .frame(maxWidth: .infinity)
                .padding()
                .background(Color.teal)
                .foregroundColor(.white)
                .cornerRadius(12)
            }
            .disabled(health.isSyncing || !health.isAuthorized)

            Button("Disconnect") {
                athleteId = ""
                apiUrl = ""
                health.disconnect()
            }
            .font(.subheadline)
            .foregroundColor(.secondary)
        }
    }

    private func statBox(_ label: String, value: String) -> some View {
        VStack(spacing: 4) {
            Text(value)
                .font(.title3).bold()
            Text(label)
                .font(.caption)
                .foregroundColor(.secondary)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 8)
        .background(Color(.systemGray6))
        .cornerRadius(8)
    }
}
