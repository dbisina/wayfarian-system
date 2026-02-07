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
                        // Live counting timer from startTime
                        HStack(spacing: 4) {
                            Image(systemName: "timer")
                                .font(.caption2)
                            Text(context.attributes.startTime, style: .timer)
                                .font(.caption2)
                                .monospacedDigit()
                        }
                        
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
                // Compact trailing - live timer
                Text(context.attributes.startTime, style: .timer)
                    .font(.caption2)
                    .fontWeight(.semibold)
                    .monospacedDigit()
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
        VStack(spacing: 14) {
            // Header with origin → destination and speed
            HStack(alignment: .top) {
                VStack(alignment: .leading, spacing: 4) {
                    // Start address - two lines, small font
                    HStack(alignment: .top, spacing: 6) {
                        Circle()
                            .fill(Color.white)
                            .frame(width: 8, height: 8)
                            .padding(.top, 3)
                        Text(context.attributes.startLocationName)
                            .font(.system(size: 11))
                            .foregroundColor(.secondary)
                            .lineLimit(2)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                    
                    // Destination address - two lines, slightly larger
                    HStack(alignment: .top, spacing: 6) {
                        Image(systemName: "mappin.circle.fill")
                            .font(.system(size: 10))
                            .foregroundColor(.orange)
                            .padding(.top, 1)
                        Text(context.attributes.destinationName)
                            .font(.system(size: 14, weight: .semibold))
                            .lineLimit(2)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                }
                
                Spacer(minLength: 12)
                
                // Current speed
                VStack(alignment: .trailing, spacing: 2) {
                    Text("\(Int(context.state.currentSpeed))")
                        .font(.system(size: 28, weight: .bold, design: .rounded))
                    Text("km/h")
                        .font(.system(size: 10))
                        .foregroundColor(.secondary)
                }
            }
            
            // Progress bar with car icon and address labels
            VStack(spacing: 6) {
                JourneyProgressView(progress: context.state.progress)
                    .padding(.horizontal, 4)
                
                // Address labels under progress bar
                HStack {
                    Text(shortenName(context.attributes.startLocationName))
                        .font(.system(size: 9))
                        .foregroundColor(.secondary)
                    Spacer()
                    Text(shortenName(context.attributes.destinationName))
                        .font(.system(size: 9))
                        .foregroundColor(.secondary)
                }
            }
            
            // Stats row
            HStack {
                // Live counting timer from startTime
                HStack(spacing: 4) {
                    Image(systemName: "timer")
                        .font(.system(size: 12))
                    Text(context.attributes.startTime, style: .timer)
                        .font(.system(size: 12, weight: .medium))
                        .monospacedDigit()
                }
                
                Spacer()
                
                // Distance traveled
                Label(formatDistance(context.state.totalDistance), systemImage: "road.lanes")
                    .font(.system(size: 12, weight: .medium))
                
                Spacer()
                
                // Distance remaining
                if let remaining = context.state.distanceRemaining, remaining > 0 {
                    Label("\(String(format: "%.1f", remaining)) km", systemImage: "flag.checkered")
                        .font(.system(size: 12))
                        .foregroundColor(.secondary)
                }
            }
        }
        .padding(.horizontal, 15)
        .padding(.vertical, 16)
        .activityBackgroundTint(.black.opacity(0.85))
        .activitySystemActionForegroundColor(.white)
    }
    
    private func shortenName(_ name: String) -> String {
        if name.count <= 15 { return name }
        let parts = name.components(separatedBy: ",")
        let first = parts.first?.trimmingCharacters(in: .whitespaces) ?? name
        if first.count <= 15 { return first }
        return String(first.prefix(14)) + "…"
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

// MARK: - Progress View with Car Icon
struct JourneyProgressView: View {
    let progress: Double
    
    var body: some View {
        GeometryReader { geometry in
            let trackWidth = geometry.size.width
            let clampedProgress = min(max(progress, 0), 1.0)
            
            ZStack(alignment: .leading) {
                // Background track (road-like)
                RoundedRectangle(cornerRadius: 5)
                    .fill(Color.gray.opacity(0.3))
                    .frame(height: 10)
                
                // Progress fill
                RoundedRectangle(cornerRadius: 5)
                    .fill(
                        LinearGradient(
                            colors: [.orange, .orange.opacity(0.7)],
                            startPoint: .leading,
                            endPoint: .trailing
                        )
                    )
                    .frame(width: trackWidth * CGFloat(clampedProgress), height: 10)
                
                // Start marker (white circle)
                Circle()
                    .fill(Color.white)
                    .frame(width: 10, height: 10)
                    .overlay(
                        Circle()
                            .stroke(Color.gray.opacity(0.5), lineWidth: 1.5)
                    )
                    .offset(x: -5)
                
                // Car icon at current position
                Image(systemName: "car.fill")
                    .font(.system(size: 16, weight: .bold))
                    .foregroundColor(.orange)
                    .shadow(color: .orange.opacity(0.6), radius: 4)
                    .offset(x: trackWidth * CGFloat(clampedProgress) - 10, y: -1)
                
                // End marker (flag)
                Image(systemName: "mappin.circle.fill")
                    .font(.system(size: 12))
                    .foregroundColor(.orange)
                    .offset(x: trackWidth - 8)
            }
        }
        .frame(height: 20)
    }
}

// MARK: - Preview
@available(iOS 17.0, *)
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
