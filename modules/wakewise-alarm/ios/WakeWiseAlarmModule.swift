import ActivityKit
import AlarmKit
import AppIntents
import ExpoModulesCore
import SwiftUI

private let pendingDismissalKey = "wakewise.pendingDismissal"

struct ScheduleRequest: Record {
  @Field var id: String = ""
  @Field var hour: Int = 0
  @Field var minute: Int = 0
  /// 0 = Monday ... 6 = Sunday. Empty means the next occurrence only.
  @Field var weekdays: [Int] = []
  /// Milliseconds since 1970 for a one-time alarm on an exact date. When set, the alarm fires at this instant.
  @Field var fireAtMs: Double? = nil
  @Field var title: String = "Alarm"
  /// File name in the main bundle, or nil for the system alarm tone.
  @Field var soundFile: String? = nil
  @Field var snoozeMinutes: Int = 0
  /// When true, the system Stop action also brings WakeWise to the foreground.
  @Field var openAppOnStop: Bool = false
}

@available(iOS 26.1, *)
struct WakeWiseAlarmMetadata: AlarmMetadata {
  var alarmId: String
}

/// Runs when the person uses the system Stop control. The system has already
/// silenced the alarm by the time this runs: it records the dismissal so the
/// app can continue with a mission, stay-awake check or after-wake audio.
@available(iOS 26.1, *)
struct WakeWiseStopIntent: LiveActivityIntent {
  static var title: LocalizedStringResource = "Stop alarm"
  static var openAppWhenRun: Bool = false

  @Parameter(title: "Alarm") var alarmID: String

  init() {}
  init(alarmID: String) { self.alarmID = alarmID }

  func perform() async throws -> some IntentResult {
    recordDismissal(alarmID)
    return .result()
  }
}

@available(iOS 26.1, *)
struct WakeWiseStopAndOpenIntent: LiveActivityIntent {
  static var title: LocalizedStringResource = "Stop alarm and open WakeWise"
  static var openAppWhenRun: Bool = true

  @Parameter(title: "Alarm") var alarmID: String

  init() {}
  init(alarmID: String) { self.alarmID = alarmID }

  func perform() async throws -> some IntentResult {
    recordDismissal(alarmID)
    return .result()
  }
}

private func recordDismissal(_ alarmID: String) {
  UserDefaults.standard.set(
    ["id": alarmID, "at": Date().timeIntervalSince1970 * 1000],
    forKey: pendingDismissalKey
  )
}

public class WakeWiseAlarmModule: Module {
  private var updatesTask: Task<Void, Never>?

  public func definition() -> ModuleDefinition {
    Name("WakeWiseAlarm")

    Events("onAlarmsChanged")

    Function("isSupported") { () -> Bool in
      if #available(iOS 26.1, *) { return true }
      return false
    }

    Function("getAuthorization") { () -> String in
      guard #available(iOS 26.1, *) else { return "unsupported" }
      return Self.describe(AlarmManager.shared.authorizationState)
    }

    AsyncFunction("requestAuthorization") { () async throws -> String in
      guard #available(iOS 26.1, *) else { return "unsupported" }
      return Self.describe(try await AlarmManager.shared.requestAuthorization())
    }

    Function("bundledSoundExists") { (file: String) -> Bool in
      Self.bundledSoundExists(file)
    }

    AsyncFunction("schedule") { (request: ScheduleRequest) async throws -> [String: Any] in
      guard #available(iOS 26.1, *) else {
        throw Exception(name: "ERR_ALARM_UNSUPPORTED", description: "System alarms need iOS 26.1 or later.")
      }
      guard let id = UUID(uuidString: request.id) else {
        throw Exception(name: "ERR_ALARM_ID", description: "Alarm id is not a UUID.")
      }

      var usedSound = "systemDefault"
      var sound = AlertConfiguration.AlertSound.default
      if let file = request.soundFile, Self.bundledSoundExists(file) {
        sound = .named(file)
        usedSound = "bundled"
      }

      let snoozes = request.snoozeMinutes > 0
      let alert = AlarmPresentation.Alert(
        title: LocalizedStringResource(String.LocalizationValue(request.title)),
        secondaryButton: snoozes
          ? AlarmButton(text: "Snooze", textColor: .white, systemImageName: "zzz")
          : nil,
        secondaryButtonBehavior: snoozes ? .countdown : nil
      )
      let attributes = AlarmAttributes<WakeWiseAlarmMetadata>(
        presentation: AlarmPresentation(alert: alert),
        metadata: WakeWiseAlarmMetadata(alarmId: request.id),
        tintColor: Color(red: 0.96, green: 0.91, blue: 0.29)
      )
      let schedule: Alarm.Schedule
      if let ms = request.fireAtMs {
        // A one-time alarm on a fixed date, so a plan for next week rings on the right day.
        schedule = Alarm.Schedule.fixed(Date(timeIntervalSince1970: ms / 1000))
      } else {
        let recurrence: Alarm.Schedule.Relative.Recurrence = request.weekdays.isEmpty
          ? .never
          : .weekly(request.weekdays.compactMap(Self.weekday))
        schedule = Alarm.Schedule.relative(
          .init(time: .init(hour: request.hour, minute: request.minute), repeats: recurrence)
        )
      }
      let stopIntent: any LiveActivityIntent = request.openAppOnStop
        ? WakeWiseStopAndOpenIntent(alarmID: request.id)
        : WakeWiseStopIntent(alarmID: request.id)
      let configuration = AlarmManager.AlarmConfiguration<WakeWiseAlarmMetadata>(
        countdownDuration: snoozes
          ? .init(preAlert: nil, postAlert: TimeInterval(request.snoozeMinutes * 60))
          : nil,
        schedule: schedule,
        attributes: attributes,
        stopIntent: stopIntent,
        secondaryIntent: nil,
        sound: sound
      )

      // Scheduling an id twice is an error, so an edit replaces the old entry.
      try? AlarmManager.shared.cancel(id: id)
      do {
        _ = try await AlarmManager.shared.schedule(id: id, configuration: configuration)
      } catch AlarmManager.AlarmError.maximumLimitReached {
        throw Exception(name: "ERR_ALARM_LIMIT", description: "iOS will not hold any more alarms for this app.")
      }
      return ["usedSound": usedSound]
    }

    AsyncFunction("cancel") { (id: String) in
      guard #available(iOS 26.1, *), let uuid = UUID(uuidString: id) else { return }
      try? AlarmManager.shared.cancel(id: uuid)
    }

    AsyncFunction("scheduled") { () throws -> [[String: String]] in
      guard #available(iOS 26.1, *) else { return [] }
      return try AlarmManager.shared.alarms.map(Self.describe)
    }

    Function("consumePendingDismissal") { () -> [String: Any]? in
      let defaults = UserDefaults.standard
      let pending = defaults.dictionary(forKey: pendingDismissalKey)
      defaults.removeObject(forKey: pendingDismissalKey)
      return pending
    }

    OnStartObserving { [weak self] in
      guard #available(iOS 26.1, *) else { return }
      self?.updatesTask = Task { [weak self] in
        for await alarms in AlarmManager.shared.alarmUpdates {
          self?.sendEvent("onAlarmsChanged", ["alarms": alarms.map(Self.describe)])
        }
      }
    }

    OnStopObserving { [weak self] in
      self?.updatesTask?.cancel()
      self?.updatesTask = nil
    }
  }

  private static func bundledSoundExists(_ file: String) -> Bool {
    Bundle.main.url(forResource: file, withExtension: nil) != nil
  }

  @available(iOS 26.1, *)
  private static func describe(_ state: AlarmManager.AuthorizationState) -> String {
    switch state {
    case .authorized: return "authorized"
    case .denied: return "denied"
    case .notDetermined: return "notDetermined"
    @unknown default: return "notDetermined"
    }
  }

  @available(iOS 26.1, *)
  private static func describe(_ alarm: Alarm) -> [String: String] {
    let state: String
    switch alarm.state {
    case .scheduled: state = "scheduled"
    case .countdown: state = "countdown"
    case .paused: state = "paused"
    case .alerting: state = "alerting"
    @unknown default: state = "scheduled"
    }
    return ["id": alarm.id.uuidString.lowercased(), "state": state]
  }

  private static func weekday(_ index: Int) -> Locale.Weekday? {
    let days: [Locale.Weekday] = [.monday, .tuesday, .wednesday, .thursday, .friday, .saturday, .sunday]
    return days.indices.contains(index) ? days[index] : nil
  }
}
