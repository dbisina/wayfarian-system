// JourneyWidgetAttributes.swift
// Defines the data model for the Journey Live Activity

import ActivityKit
import Foundation

/// Attributes that describe the Live Activity (static data set when activity starts)
public struct JourneyWidgetAttributes: ActivityAttributes {
    /// Dynamic state that can be updated during the activity
    public struct ContentState: Codable, Hashable {
        // Journey progress
        var elapsedTime: Int // seconds
        var totalDistance: Double // km
        var currentSpeed: Double // km/h
        var progress: Double // 0.0 to 1.0
        var distanceRemaining: Double? // km
    }
    
    // Static attributes (set when activity starts)
    var journeyId: String
    var startLocationName: String
    var destinationName: String
    var startTime: Date
}
