//
//  AppIntents.swift
//  ItsukiAlarm
//
//  Created by Itsuki on 2025/06/15.
//

import AppIntents
import AlarmKit

// NOTE:
// using functions defined in `ItsukiAlarmManager` instead of directly call on `AlarmManager.shared`
// so that the system can wake our app up if it is killed and we can update the data we keep.


// Stops the alarm with the specified ID.
//
// If the alarm is a one-shot, meaning
// it doesn't have a repeating schedule, then the system deletes the alarm.
// If the alarm repeats then it's rescheduled to alert or begins
// counting down at the next scheduled time.
struct StopIntent:  LiveActivityIntent {
    func perform() throws -> some IntentResult {
        guard let id = UUID(uuidString: alarmID) else {
            throw ItsukiAlarmManager._Error.badAlarmID
        }
        Task { @MainActor in
            try ItsukiAlarmManager.shared.stopAlarm(id)
        }

        return .result()
    }
    
    static var title: LocalizedStringResource = "Stop"
    static var description = IntentDescription("Stop an alert")
    
    @Parameter(title: "alarmID")
    var alarmID: String
    
    init(alarmID: UUID) {
        self.alarmID = alarmID.uuidString
    }

    init() {
        self.alarmID = ""
    }
}


// Pauses the alarm with the specified ID if it's in the countdown
// state.
// send the alarm to pause state
struct PauseIntent: LiveActivityIntent {
    func perform() throws -> some IntentResult {
        guard let id = UUID(uuidString: alarmID) else {
            throw ItsukiAlarmManager._Error.badAlarmID
        }
        
        Task { @MainActor in
            try ItsukiAlarmManager.shared.pauseAlarm(id)
        }
        
        return .result()
    }
    
    static var title: LocalizedStringResource = "Pause"
    static var description = IntentDescription("Pause a countdown")
    
    @Parameter(title: "alarmID")
    var alarmID: String
    
    
    init(alarmID: UUID) {
        self.alarmID = alarmID.uuidString
    }

    init() {
        self.alarmID = ""
    }
}


// Performs a countdown for the alarm with the specified ID if it's currently alerting
// This is identical to
// - the repeat function of a timer, or
// - the snooze function of an alarm.
struct RepeatIntent: LiveActivityIntent {
    func perform() throws -> some IntentResult {
        guard let id = UUID(uuidString: alarmID) else {
            throw ItsukiAlarmManager._Error.badAlarmID
        }

        Task { @MainActor in
            try ItsukiAlarmManager.shared.repeatAlarm(id)
        }

        return .result()
    }
    
    static var title: LocalizedStringResource = "Repeat"
    static var description = IntentDescription("Repeat an alarm")
    
    @Parameter(title: "alarmID")
    var alarmID: String
    
    init(alarmID: UUID) {
        self.alarmID = alarmID.uuidString
    }
    
    init() {
        self.alarmID = ""
    }
}


// Resumes the alarm with the specified ID if it is in the paused state.
//
// The function throws otherwise.
// Sends the alarm to the `countdown` state.
// - Parameter id: The identifier of the alarm to resume.
struct ResumeIntent: LiveActivityIntent {
    func perform() throws -> some IntentResult {
        guard let id = UUID(uuidString: alarmID) else {
            throw ItsukiAlarmManager._Error.badAlarmID
        }
        Task { @MainActor in
            try ItsukiAlarmManager.shared.resumeAlarm(id)
        }

        return .result()
    }
    
    static var title: LocalizedStringResource = "Resume"
    static var description = IntentDescription("Resume a countdown")
    
    @Parameter(title: "alarmID")
    var alarmID: String
    
    init(alarmID: UUID) {
        self.alarmID = alarmID.uuidString
    }

    init() {
        self.alarmID = ""
    }
}
