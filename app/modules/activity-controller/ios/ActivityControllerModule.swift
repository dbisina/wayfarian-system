import ExpoModulesCore
import ActivityKit
import Foundation

// Define the attributes structure to match the Widget's definition exactly
// This must be a COPY of what is in JourneyWidgetAttributes.swift in the Widget Target
public struct JourneyWidgetAttributes: ActivityAttributes {
    public struct ContentState: Codable, Hashable {
        var elapsedTime: Int
        var totalDistance: Double
        var currentSpeed: Double
        var progress: Double
        var distanceRemaining: Double?
    }

    var journeyId: String
    var startLocationName: String
    var destinationName: String
    var startTime: Date
}

// Params received from JS for startLiveActivity
struct StartPayload: Decodable {
    struct AttributesData: Decodable {
        let journeyId: String
        let startLocationName: String
        let destinationName: String
        let startTime: Double // JS timestamp (ms)
    }
    
    let attributes: AttributesData
    let contentState: JourneyWidgetAttributes.ContentState
}

public class ActivityControllerModule: Module {
  public func definition() -> ModuleDefinition {
    Name("ActivityController")

    Property("areLiveActivitiesEnabled") {
      if #available(iOS 16.2, *) {
        return ActivityAuthorizationInfo().areActivitiesEnabled
      }
      return false
    }

    // Start a new Live Activity
    AsyncFunction("startLiveActivity") { (rawData: String) async throws -> Void in
      guard #available(iOS 16.2, *) else {
        throw ActivityUnavailableException()
      }
        
      print("[ActivityController] Requesting to start activity with data: \(rawData)")
      
      let data = Data(rawData.utf8)
      let decoder = JSONDecoder()
      
      let payload = try decoder.decode(StartPayload.self, from: data)
      
      let attributes = JourneyWidgetAttributes(
        journeyId: payload.attributes.journeyId,
        startLocationName: payload.attributes.startLocationName,
        destinationName: payload.attributes.destinationName,
        startTime: Date(timeIntervalSince1970: payload.attributes.startTime / 1000.0)
      )
      
      let contentState = payload.contentState
      
      do {
        // Stop existing activities first to avoid multiples? 
        // For now, let's allow overlapping or maybe we stick to one.
        // The previous code had a check, let's strict it to one for now.
        for existing in Activity<JourneyWidgetAttributes>.activities {
            await existing.end(dismissalPolicy: .immediate)
        }

        let _ = try Activity<JourneyWidgetAttributes>.request(
             attributes: attributes,
             contentState: contentState,
             pushType: nil 
        )
        print("[ActivityController] Started activity successfully")
      } catch {
         print("[ActivityController] Error starting activity: \(error)")
         throw error
      }
    }

    // Update the active Live Activity
    AsyncFunction("updateLiveActivity") { (rawData: String) async throws -> Void in
      guard #available(iOS 16.2, *) else { return }
      
      // We take the most recent activity (or all?)
      // Usually updating the most recent one is desired.
      guard let activity = Activity<JourneyWidgetAttributes>.activities.first else {
        print("[ActivityController] No activity found to update")
        return
      }
      
      let data = Data(rawData.utf8)
      let contentState = try JSONDecoder().decode(JourneyWidgetAttributes.ContentState.self, from: data)
      
      await activity.update(using: contentState)
      print("[ActivityController] Updated activity")
    }

    // Stop all Live Activities
    AsyncFunction("stopLiveActivity") { () async throws -> Void in
      guard #available(iOS 16.2, *) else { return }
      
      for activity in Activity<JourneyWidgetAttributes>.activities {
          await activity.end(dismissalPolicy: .immediate)
      }
      print("[ActivityController] Stopped all activities")
    }

    Function("isLiveActivityRunning") { () -> Bool in
      if #available(iOS 16.2, *) {
        return !Activity<JourneyWidgetAttributes>.activities.isEmpty
      }
      return false
    }
  }
}

final class ActivityUnavailableException: Exception {
  override var reason: String { "Live activities are not available on this system." }

  init() {
    super.init(file: #fileID, line: #line, function: #function)
  }
}
