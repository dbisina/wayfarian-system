// JourneyLiveActivity.swift
// SwiftUI views for the Live Activity on lock screen and Dynamic Island

import ActivityKit
import WidgetKit
import SwiftUI

struct JourneyLiveActivity: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: JourneyWidgetAttributes.self) { context in
            // Lock Screen / Notification Center view
            LockScreenView(context: context)
        } dynamicIsland: { context in
            DynamicIsland {
                // Expanded Dynamic Island view
                DynamicIslandExpandedRegion(.leading) {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(context.attributes.startLocationName)
                            .font(.caption2)
                            .foregroundColor(.secondary)
                        Image(systemName: "arrow.down")
                            .font(.caption2)
                            .foregroundColor(.secondary)
                        Text(context.attributes.destinationName)
                            .font(.caption2)
                            .fontWeight(.semibold)
                    }
                }
                
                DynamicIslandExpandedRegion(.trailing) {
                    VStack(alignment: .trailing, spacing: 2) {
                        Text(formatDistance(context.state.totalDistance))
                            .font(.caption)
                            .fontWeight(.bold)
                        Text("\(Int(context.state.currentSpeed)) km/h")
                            .font(.caption2)
                            .foregroundColor(.secondary)
                    }
                }
                
                DynamicIslandExpandedRegion(.center) {
                    // Progress visualization
                    JourneyProgressView(progress: context.state.progress)
                }
                
                DynamicIslandExpandedRegion(.bottom) {
                    HStack {
                        // Elapsed time
                        Label(formatDuration(context.state.elapsedTime), systemImage: "timer")
                            .font(.caption2)
                        
                        Spacer()
                        
                        // Distance remaining
                        if let remaining = context.state.distanceRemaining, remaining > 0 {
                            Text("\(String(format: "%.1f", remaining)) km left")
                                .font(.caption2)
                                .foregroundColor(.secondary)
                        }
                    }
                }
            } compactLeading: {
                // Compact leading (left side of Dynamic Island)
                Image(systemName: "car.fill")
                    .foregroundColor(.orange)
            } compactTrailing: {
                // Compact trailing (right side of Dynamic Island)
                Text(formatDistance(context.state.totalDistance))
                    .font(.caption2)
                    .fontWeight(.semibold)
            } minimal: {
                // Minimal view (when another Live Activity is showing)
                Image(systemName: "car.fill")
                    .foregroundColor(.orange)
            }
        }
    }
    
    // MARK: - Helper Functions
    
    private func formatDistance(_ km: Double) -> String {
        if km < 1 {
            return "\(Int(km * 1000))m"
        }
        return String(format: "%.1f km", km)
    }
    
    private func formatDuration(_ seconds: Int) -> String {
        let hours = seconds / 3600
        let minutes = (seconds % 3600) / 60
        let secs = seconds % 60
        
        if hours > 0 {
            return String(format: "%d:%02d:%02d", hours, minutes, secs)
        }
        return String(format: "%d:%02d", minutes, secs)
    }
}

// MARK: - Lock Screen View
struct LockScreenView: View {
    let context: ActivityViewContext<JourneyWidgetAttributes>
    
    var body: some View {
        VStack(spacing: 12) {
            // Header with origin → destination
            HStack {
                VStack(alignment: .leading, spacing: 2) {
                    Text(context.attributes.startLocationName)
                        .font(.caption)
                        .foregroundColor(.secondary)
                    Text(context.attributes.destinationName)
                        .font(.headline)
                        .fontWeight(.semibold)
                }
                Spacer()
                // Current speed
                VStack(alignment: .trailing) {
                    Text("\(Int(context.state.currentSpeed))")
                        .font(.title2)
                        .fontWeight(.bold)
                    Text("km/h")
                        .font(.caption2)
                        .foregroundColor(.secondary)
                }
            }
            
            // Progress bar with markers
            JourneyProgressView(progress: context.state.progress)
            
            // Stats row
            HStack {
                // Elapsed time
                Label(formatDuration(context.state.elapsedTime), systemImage: "timer")
                    .font(.caption)
                
                Spacer()
                
                // Distance traveled
                Label(formatDistance(context.state.totalDistance), systemImage: "road.lanes")
                    .font(.caption)
                
                Spacer()
                
                // Distance remaining
                if let remaining = context.state.distanceRemaining, remaining > 0 {
                    Label("\(String(format: "%.1f", remaining)) km", systemImage: "flag.checkered")
                        .font(.caption)
                        .foregroundColor(.secondary)
                }
            }
        }
        .padding()
        .activityBackgroundTint(.black.opacity(0.8))
        .activitySystemActionForegroundColor(.white)
    }
    
    private func formatDistance(_ km: Double) -> String {
        if km < 1 {
            return "\(Int(km * 1000))m"
        }
        return String(format: "%.1f km", km)
    }
    
    private func formatDuration(_ seconds: Int) -> String {
        let hours = seconds / 3600
        let minutes = (seconds % 3600) / 60
        let secs = seconds % 60
        
        if hours > 0 {
            return String(format: "%d:%02d:%02d", hours, minutes, secs)
        }
        return String(format: "%d:%02d", minutes, secs)
    }
}

// MARK: - Progress View with Markers
struct JourneyProgressView: View {
    let progress: Double
    
    var body: some View {
        GeometryReader { geometry in
            ZStack(alignment: .leading) {
                // Background track
                RoundedRectangle(cornerRadius: 4)
                    .fill(Color.gray.opacity(0.3))
                    .frame(height: 8)
                
                // Progress fill
                RoundedRectangle(cornerRadius: 4)
                    .fill(
                        LinearGradient(
                            colors: [.orange, .orange.opacity(0.7)],
                            startPoint: .leading,
                            endPoint: .trailing
                        )
                    )
                    .frame(width: geometry.size.width * CGFloat(min(progress, 1.0)), height: 8)
                
                // Start marker (black circle ring)
                Circle()
                    .stroke(Color.black, lineWidth: 2)
                    .frame(width: 12, height: 12)
                    .background(Circle().fill(Color.white))
                    .offset(x: -6)
                
                // Current position marker
                Circle()
                    .fill(Color.orange)
                    .frame(width: 14, height: 14)
                    .shadow(color: .orange.opacity(0.5), radius: 4)
                    .offset(x: geometry.size.width * CGFloat(min(progress, 1.0)) - 7)
                
                // End marker (orange circle ring)
                Circle()
                    .stroke(Color.orange, lineWidth: 2)
                    .frame(width: 12, height: 12)
                    .background(Circle().fill(Color.white))
                    .offset(x: geometry.size.width - 6)
            }
        }
        .frame(height: 16)
    }
}

// MARK: - Preview
#Preview("Lock Screen", as: .content, using: JourneyWidgetAttributes.preview) {
    JourneyLiveActivity()
} contentStates: {
    JourneyWidgetAttributes.ContentState.preview
}

extension JourneyWidgetAttributes {
    static var preview: JourneyWidgetAttributes {
        JourneyWidgetAttributes(
            journeyId: "preview-123",
            startLocationName: "Home",
            destinationName: "Work",
            startTime: Date()
        )
    }
}

extension JourneyWidgetAttributes.ContentState {
    static var preview: JourneyWidgetAttributes.ContentState {
        JourneyWidgetAttributes.ContentState(
            elapsedTime: 1845,
            totalDistance: 12.5,
            currentSpeed: 45,
            progress: 0.65,
            distanceRemaining: 6.8
        )
    }
}
