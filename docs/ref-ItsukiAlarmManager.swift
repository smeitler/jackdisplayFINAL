//
//  ItsukiAlarmManager.swift
//  ItsukiAlarm
//
//  Created by Itsuki on 2025/06/15.
//

import SwiftUI
// required to send main-actor isolated alarmManager to nonisolated functions
//@preconcurrency
import AlarmKit
import ActivityKit



extension ItsukiAlarmManager {
    enum _Error: Error, LocalizedError {
        case noAuthorized
        case unknownAuthState
        case failToCreateSchedule
        case badAlarmID
        case alarmNotFound
        
        var message: String {
            switch self {
                
            case .noAuthorized:
                "Not authorized to access alarm!"
            case .unknownAuthState:
                "Unknown authorization state!"
            case .failToCreateSchedule:
                "Fail to create an alarm schedule!"
            case .badAlarmID:
                "Bad Alarm Id!"
            case .alarmNotFound:
                "Alarm Not Found"
            }
        }
    }
}


@Observable
@MainActor
//nonisolated
class ItsukiAlarmManager {
    static let shared = ItsukiAlarmManager()
    
    private let runningAlarmKey = "ItsukiAlarm.running"
    private let recentAlarmKey = "ItsukiAlarm.recent"
    // needed to share data between main app and extension
    private let groupId = "group.itsukiAlarm"
    private var userDefaults: UserDefaults {
        UserDefaults(suiteName: groupId) ?? UserDefaults.standard
    }
        

    private let jsonEncoder: JSONEncoder = JSONEncoder()
    private let decoder: JSONDecoder = JSONDecoder()

    
    var error: (any Error)? = nil {
        didSet {
            if error != nil {
                print(error!)
                showError = true
            }
        }
    }
    
    var showError: Bool = false {
        didSet {
            if !showError {
                self.error = nil
            }
        }
    }

    var runningAlarms: [ItsukiAlarm] = [] {
        didSet {
            do {
                let data = try self.jsonEncoder.encode(self.runningAlarms)
                userDefaults.set(data, forKey: self.runningAlarmKey)
            } catch(let error) {
                dump(error)
            }
        }
    }
    
    private var recentAlarms: [ItsukiAlarm] = [] {
        didSet {
            do {
                let data = try self.jsonEncoder.encode(self.recentAlarms)
                userDefaults.set(data, forKey: self.recentAlarmKey)
            } catch(let error) {
                dump(error)
            }
        }
    }
    
    var runningTraditionalAlarms: [ItsukiAlarm] {
        return self.runningAlarms.filter({$0.itsukiAlarmType == .alarm}).sorted
    }
    
    var recentTraditionalAlarms: [ItsukiAlarm] {
        return self.recentAlarms.filter({$0.itsukiAlarmType == .alarm}).sorted
    }
    
    var runningCustomAlarms: [ItsukiAlarm] {
        return self.runningAlarms.filter({$0.itsukiAlarmType == .custom}).sorted
    }
    
    var recentCustomAlarms: [ItsukiAlarm] {
        return self.recentAlarms.filter({$0.itsukiAlarmType == .custom}).sorted
    }

    
    var runningTimer: [ItsukiAlarm] {
        return self.runningAlarms.filter({$0.itsukiAlarmType == .timer})
    }
    
    var recentTimer: [ItsukiAlarm] {
        return self.recentAlarms.filter({$0.itsukiAlarmType == .timer})
    }

    
    // An object that contains all the properties necessary to schedule an alarm.
    // AlarmMetadata: A metadata object that contains information about an alarm.
    // Provide an implementation of this for your own custom content or other information. The implementation can be empty if you don’t want to provide any additional data for your alarm UI.
    typealias AlarmConfiguration = AlarmManager.AlarmConfiguration<_AlarmMetadata>

    // AlarmManager: https://developer.apple.com/documentation/alarmkit/alarmmanager
    // An object that exposes functions to work with alarms: scheduling, snoozing, cancelling.
    private let alarmManager = AlarmManager.shared
    
    private init() {
        do {
            try self.initializeLocalAlarms()
            try self.initializeRemoteAlarms()
        } catch (let error) {
            self.error = error
        }
        
        observeAlarms()
        observeAuthorizationUpdates()
    }
    
    private func initializeLocalAlarms() throws {
        let runningAlarms: [ItsukiAlarm] = if let data = userDefaults.data(forKey: self.runningAlarmKey) {
            try self.decoder.decode([ItsukiAlarm].self, from: data)
        } else {
            []
        }
        let recentAlarms: [ItsukiAlarm] = if let data = userDefaults.data(forKey: self.recentAlarmKey) {
            try self.decoder.decode([ItsukiAlarm].self, from: data)
        } else {
            []
        }
        self.runningAlarms = runningAlarms
        self.recentAlarms = recentAlarms
    }

    
    private func initializeRemoteAlarms() throws {
        // As soon as an alarm fires and stops it’s deleted from the daemon’s store.
        // If we want to determine if a one-shot alarm has fired, persist your alarms in your own store and compare that with the result of this function call.
        // If the array is missing scheduled alarms, then those alarms fired.
        let remoteAlarms: [Alarm] = try self.alarmManager.alarms
        combineLocalRemoteAlarms(localRunningAlarms: self.runningAlarms, localRecentAlarms: self.recentAlarms, remoteAlarms: remoteAlarms)
    }
    
    private func combineLocalRemoteAlarms(localRunningAlarms: [ItsukiAlarm], localRecentAlarms: [ItsukiAlarm], remoteAlarms: [Alarm]) {
        
        var runningAlarms: [ItsukiAlarm] = []
        var recentAlarms: [ItsukiAlarm] = localRecentAlarms

        for var alarm in localRunningAlarms {
            // alarm still exists in AlarmKit store: currently running/scheduled
            if let remote = remoteAlarms.first(where: {$0.id == alarm.id}) {

                alarm.alarm = remote
                runningAlarms.append(alarm)

            } else {
                switch alarm.itsukiAlarmType {
                case .timer:
                    continue
                case .alarm, .custom:
                    alarm.presentationMode = nil
                    recentAlarms.removeAll(where: {$0.id == alarm.id})
                    recentAlarms.append(alarm)
                    continue
                }
            }
        }
        
        let localIds = Set(runningAlarms.map(\.id))
        let remoteIds = Set(remoteAlarms.map(\.id))
        let addedIds = remoteIds.subtracting(localIds)
        let addedAlarms = remoteAlarms.filter({addedIds.contains($0.id)})
        
        runningAlarms.append(contentsOf: addedAlarms.map({
            ItsukiAlarm(alarm: $0, metadata: .defaultMetadata(for: $0.itsukiAlarmType))
        }))
        
        
        self.runningAlarms = runningAlarms
        self.recentAlarms = recentAlarms

    }
    

    // AlarmManager.AlarmUpdates: https://developer.apple.com/documentation/alarmkit/alarmmanager/alarmupdates-swift.struct
    // An async sequence that publishes whenever an alarm changes.
    private func observeAlarms() {
        Task {
            for await remoteAlarms in alarmManager.alarmUpdates {
                combineLocalRemoteAlarms(localRunningAlarms: self.runningAlarms, localRecentAlarms: self.recentAlarms, remoteAlarms: remoteAlarms)
            }
        }
    }
    
    
    // add traditional alarm
    func addAlarm(_ title: String, icon: _AlarmMetadata.Icon, date: Date, repeats: Set<Locale.Weekday>) async throws {
        let title = title.isEmpty ? _AlarmMetadata.alarmDefaultMetadata.title : title
        let metadata = _AlarmMetadata(icon: icon, title: title)
        let schedule = try self.createRelativeSchedule(date: date, repeats: repeats)
        try await self._addAlarm(metadata: metadata, alarmID: UUID(), schedule: schedule)
    }
    
    
    func editAlarm(_ alarmId: Alarm.ID, title: String, icon: _AlarmMetadata.Icon, date: Date, repeats: Set<Locale.Weekday>) async throws {
        let title = title.isEmpty ? _AlarmMetadata.alarmDefaultMetadata.title : title

        let metadata = _AlarmMetadata(icon: icon, title: title)
        let schedule = try self.createRelativeSchedule(date: date, repeats: repeats)

        if let running = self.runningAlarms.first(where: {$0.id == alarmId}), running.itsukiAlarmType == .alarm {
            try self.deleteAlarm(alarmId)
            try await self._addAlarm(metadata: metadata, alarmID: alarmId, schedule: schedule)
            return
        }
        
        if let recentIndex = self.recentAlarms.firstIndex(where: {$0.id == alarmId}), self.recentAlarms[recentIndex].itsukiAlarmType == .alarm {
            var newAlarm = self.recentAlarms[recentIndex].alarm
            
            newAlarm.schedule = schedule
            
            self.recentAlarms[recentIndex].alarm = newAlarm
            self.recentAlarms[recentIndex].metadata = metadata
            
            try await self.toggleAlarm(alarmId)
            return
        }
    }
    
    func toggleAlarm(_ alarmId: Alarm.ID) async throws {
        if var running = self.runningAlarms.first(where: {$0.id == alarmId}), running.itsukiAlarmType == .alarm {
            try self.deleteAlarm(alarmId)
            running.presentationMode = nil
            self.recentAlarms.append(running)
            
            return
        }
        
        if let recent = self.recentAlarms.first(where: {$0.id == alarmId}), recent.itsukiAlarmType == .alarm {
            guard let schedule = recent.schedule else {
                return
            }
            var metadata = recent.metadata
            metadata.createdAt = Date()
            try await self._addAlarm(metadata: metadata, alarmID: alarmId, schedule: schedule)
        }
    }
    
    private func _addAlarm(metadata: _AlarmMetadata, alarmID: UUID, schedule: Alarm.Schedule) async throws {
        let presentation = self.createAlarmPresentation(metadata.title, countdown: false, snooze: false)

        let attributes = AlarmAttributes(
            presentation: presentation,
            metadata: metadata,
            // text color are set for each button in AlarmButton
            tintColor: .alarmTint
        )

        let configuration = AlarmConfiguration.alarm(
            schedule: schedule,
            attributes: attributes,
            stopIntent: StopIntent(alarmID: alarmID),
            secondaryIntent: nil,
            sound: .default
            // For some reason, setting the sound to default will not play any sounds
            // However, setting it to some random string like following will have it play the default sounds
            // sound: .named("")
        )
        
        try await self.schedule(id: alarmID, configuration: configuration, metadata: metadata)
    }
    
    

    private func createRelativeSchedule(date: Date, repeats: Set<Locale.Weekday>) throws -> Alarm.Schedule {
        guard let time = date.time else {
            throw _Error.failToCreateSchedule
        }
                
        let relativeSchedule: Alarm.Schedule.Relative = .init(
            time: time,
            repeats: repeats.isEmpty ? .never : .weekly(Array(repeats))
        )
        
        let schedule = Alarm.Schedule.relative(relativeSchedule)
        return schedule
    }
    
    
    private func createFixedSchedule(date: Date) -> Alarm.Schedule {
        let schedule = Alarm.Schedule.fixed(date)
        return schedule
    }
    
    
    // add a traditional timer
    func addTimer(_ title: String, icon: _AlarmMetadata.Icon, duration: TimeInterval) async throws {
        let title = title.isEmpty ? _AlarmMetadata.timerDefaultMetadata.title : title

        let metadata = _AlarmMetadata(icon: icon, title: title)
        let alarmID = UUID()
        
        try await self._addTimer(metadata: metadata, alarmID: alarmID, duration: duration)
    }
    
    func addTimer(existing: ItsukiAlarm.ID) async throws {
        guard let alarm = self.recentTimer.first(where: {$0.id == existing}) else {
            throw _Error.alarmNotFound
        }
        
        let metadata = _AlarmMetadata(icon: alarm.icon, title: alarm.title)
        let duration = alarm.timerDuration ?? 0
        let alarmID = UUID()

        try await self._addTimer(metadata: metadata, alarmID: alarmID, duration: duration)
    }
    
    private func _addTimer(metadata: _AlarmMetadata, alarmID: UUID, duration: TimeInterval) async throws {

        let presentation = self.createAlarmPresentation(metadata.title, countdown: true, snooze: false)
        
        let attributes = AlarmAttributes(
            presentation: presentation,
            metadata: metadata,
            tintColor: .alarmTint
        )
        
        // a wrapper around init(countdownDuration:schedule:attributes:stopIntent:secondaryIntent:sound:) to create a traditional timer.
        // duration here is used for both `preAlert` and `postAlert` of the `CountdownDuration`
        let configuration = AlarmConfiguration.timer(
            duration: duration,
            attributes: attributes,
            stopIntent: StopIntent(alarmID: alarmID),
            secondaryIntent: RepeatIntent(alarmID: alarmID),
            sound: .default
            // For some reason, setting the sound to default will not play any sounds
            // However, setting it to some random string like following will have it play the default sounds
            // sound: .named("")

        )
        
        try await self.schedule(id: alarmID, configuration: configuration, metadata: metadata)
    }
    
   
    private func schedule(id: UUID, configuration: AlarmConfiguration, metadata: _AlarmMetadata) async throws {
        try await checkAuthorization()
        let alarm = try await alarmManager.schedule(id: id, configuration: configuration)
        
        self.runningAlarms.removeAll(where: {$0.id == alarm.id})
        self.runningAlarms.insert(.init(alarm: alarm, metadata: metadata), at: 0)
        
        if alarm.itsukiAlarmType == .timer && !recentAlarms.contains(where: {
            $0.schedule == alarm.schedule &&
            $0.countdownDuration == alarm.countdownDuration &&
            $0.metadata.icon == metadata.icon &&
            $0.metadata.title == metadata.title
        }) {
            recentAlarms.insert(.init(alarm: alarm, metadata: metadata, isRecent: true), at: 0)
        }
        
        if alarm.itsukiAlarmType == .custom || alarm.itsukiAlarmType == .alarm {
            recentAlarms.removeAll(where: {$0.id == id})
        }
    }
    
    
    func deleteAlarm(_ alarmID: UUID) throws {
        if self.runningAlarms.contains(where: {$0.id == alarmID}){
            // trying to remove an alarm that does not exist in the system daemon's store will result in error.
            try self.alarmManager.cancel(id: alarmID)
            self.runningAlarms.removeAll(where: {$0.id == alarmID})
        } else {
            self.recentAlarms.removeAll(where: {$0.id == alarmID})
        }
    }
    
    
    func pauseAlarm(_ alarmID: UUID) throws {
        try self.alarmManager.pause(id: alarmID)
        self.updateAlarmState(alarmID, to: .paused)
    }
    
    private func updateAlarmState(_ alarmID: UUID, to state: Alarm.State) {
        guard let firstIndex = self.runningAlarms.firstIndex(where: {$0.id == alarmID}) else {
            return
        }
        var newAlarm = self.runningAlarms[firstIndex].alarm
        newAlarm.state = state
        self.runningAlarms[firstIndex].alarm = newAlarm
    }
    
    // `stop`: Stops the alarm with the specified ID.
    //
    // If the alarm is a one-shot, meaning
    // it doesn't have a repeating schedule, then the system deletes the alarm.
    // If the alarm repeats then it's rescheduled to alert or begins
    // counting down at the next scheduled time.
    //
    // NOTE: For one shot alarm with a schedule, this function does not delete the alarm correctly. Using `cancel` instead.
    func stopAlarm(_ alarmID: UUID) throws {
        if let alarm = self.runningAlarms.first(where: {$0.id == alarmID}), alarm.isOneShot {
            try self.alarmManager.cancel(id: alarmID)
        } else {
            try self.alarmManager.stop(id: alarmID)
        }
    }
    
    // Performs a countdown for the alarm with the specified ID if it's currently alerting
    //
    // This is identical to
    // - the repeat function of a timer, or
    // - the snooze function of an alarm.
    func repeatAlarm(_ alarmID: UUID) throws {
        try self.alarmManager.countdown(id: alarmID)
        self.updateAlarmState(alarmID, to: .countdown)
    }
    
    func resumeAlarm(_ alarmID: UUID) throws {
        try self.alarmManager.resume(id: alarmID)
        self.updateAlarmState(alarmID, to: .countdown)
    }
    
    
    func addCustom(_ title: String, icon: _AlarmMetadata.Icon, isFixedDate: Bool, date: Date, repeats: Set<Locale.Weekday>, countdown: TimeInterval, snooze: TimeInterval) async throws {
        let title = title.isEmpty ? _AlarmMetadata.customDefaultMetadata.title : title
        let metadata = _AlarmMetadata(icon: icon, title: title)
        
        let schedule = isFixedDate ? self.createFixedSchedule(date: date) : try self.createRelativeSchedule(date: date, repeats: repeats)
        let countdownDuration = self.createCountdownDuration(preAlert: countdown, postAlert: snooze)
        
        try await self._addCustom(metadata: metadata, alarmID: UUID(), schedule: schedule, countdownDuration: countdownDuration)
    }
    
    
    func createCountdownDuration(preAlert: TimeInterval?, postAlert: TimeInterval?) -> Alarm.CountdownDuration? {
        let preAlert = preAlert ?? 0
        let postAlert = postAlert ?? 0
        
        if preAlert == 0 && postAlert == 0 {
            return nil
        }
        return .init(preAlert: preAlert == 0 ? nil : preAlert, postAlert: postAlert == 0 ? nil : postAlert)
    }
    

    
    func editCustom(_ alarmId: Alarm.ID, title: String, icon: _AlarmMetadata.Icon, isFixedDate: Bool, date: Date, repeats: Set<Locale.Weekday>, countdown: TimeInterval, snooze: TimeInterval) async throws {
        let title = title.isEmpty ? _AlarmMetadata.alarmDefaultMetadata.title : title
        let metadata = _AlarmMetadata(icon: icon, title: title)
        
        let schedule = isFixedDate ? self.createFixedSchedule(date: date) : try self.createRelativeSchedule(date: date, repeats: repeats)
        let countdownDuration = self.createCountdownDuration(preAlert: countdown, postAlert: snooze)

        if let running = self.runningAlarms.first(where: {$0.id == alarmId}), running.itsukiAlarmType == .custom {
            try self.deleteAlarm(alarmId)
            try await self._addCustom(metadata: metadata, alarmID: alarmId, schedule: schedule, countdownDuration: countdownDuration)
            
            return
        }
        
        if let recentIndex = self.recentAlarms.firstIndex(where: {$0.id == alarmId}), self.recentAlarms[recentIndex].itsukiAlarmType == .custom {
            
            var newAlarm = self.recentAlarms[recentIndex].alarm
            
            newAlarm.schedule = schedule
            newAlarm.countdownDuration = countdownDuration
            
            self.recentAlarms[recentIndex].alarm = newAlarm
            self.recentAlarms[recentIndex].metadata = metadata
            
            try await self.toggleCustom(alarmId)
            return
        }
    }
    
    func toggleCustom(_ alarmId: Alarm.ID) async throws {
        if var running = self.runningAlarms.first(where: {$0.id == alarmId}), running.itsukiAlarmType == .custom {
            try self.deleteAlarm(alarmId)
            running.presentationMode = nil
            self.recentAlarms.append(running)
            return
        }
        
        if let recent = self.recentAlarms.first(where: {$0.id == alarmId}), recent.itsukiAlarmType == .custom {
            var metadata = recent.metadata
            metadata.createdAt = Date()
            try await self._addCustom(metadata: metadata, alarmID: alarmId, schedule: recent.schedule, countdownDuration: recent.countdownDuration)
        }
    }
    
    private func _addCustom(metadata: _AlarmMetadata, alarmID: UUID, schedule: Alarm.Schedule?, countdownDuration: Alarm.CountdownDuration?) async throws {
        let snoozeEnabled = countdownDuration?.postAlert != nil
        let countdown = countdownDuration?.preAlert != nil
        
        let presentation = self.createAlarmPresentation(metadata.title, countdown: countdown, snooze: snoozeEnabled)

        let attributes = AlarmAttributes(
            presentation: presentation,
            metadata: metadata,
            // text color are set for each button in AlarmButton
            tintColor: .alarmTint
        )

        // init(countdownDuration:schedule:attributes:stopIntent:secondaryIntent:sound:): https://developer.apple.com/documentation/alarmkit/alarmmanager/alarmconfiguration/init(countdownduration:schedule:attributes:stopintent:secondaryintent:sound:)
        //
        // Creates a countdown that can start and repeat based on the schedule.
        //
        // This is the generic initializer which means we can create
        // - a traditional alarm with it by setting `countdownDuration` to `nil`, or
        // - a traditional timer by setting `schedule` to `nil`, countdownDuration (both preAlert and postAlert) to the timer duration
        let configuration = AlarmConfiguration(
            countdownDuration: countdownDuration,
            schedule: schedule,
            attributes: attributes,
            stopIntent: StopIntent(alarmID: alarmID),
            secondaryIntent: snoozeEnabled ? RepeatIntent(alarmID: alarmID) : nil,
            sound: .default
            // For some reason, setting the sound to default will not play any sounds
            // However, setting it to some random string like following will have it play the default sounds
            // sound: .named("")
        )
        
        try await self.schedule(id: alarmID, configuration: configuration, metadata: metadata)
    }
    

    private func createAlarmPresentation(_ title: String, countdown: Bool, snooze: Bool) -> AlarmPresentation {
        // countdown behavior:
        // - the repeat function of a timer, or
        // - the snooze function of an alarm.
        let secondaryBehavior: AlarmPresentation.Alert.SecondaryButtonBehavior? = (countdown || snooze) ? .countdown : nil
        let secondaryButton: AlarmButton? = snooze ? .snoozeButton : countdown ? .repeatButton : nil
        
        let alert = AlarmPresentation.Alert(
            title: LocalizedStringResource(stringLiteral: title),
            stopButton: .stopButton,
            secondaryButton: secondaryButton,
            secondaryButtonBehavior: secondaryBehavior
        )

        if !countdown && !snooze {
            return AlarmPresentation(alert: alert)
        }

        let countdown = AlarmPresentation.Countdown(
            title: "Counting down",
            pauseButton: .pauseButton
        )

        let paused = AlarmPresentation.Paused(
            title: "Paused",
            resumeButton: .resumeButton
        )
        
        return AlarmPresentation(alert: alert, countdown: countdown, paused: paused)
    }
    
    
    private func checkAuthorization() async throws {
        switch alarmManager.authorizationState {
        case .notDetermined:
            let state = try await self.alarmManager.requestAuthorization()
            if state != .authorized {
                throw _Error.noAuthorized
            }
        case .denied:
            throw _Error.noAuthorized
        case .authorized:
            return
        @unknown default:
            throw _Error.unknownAuthState
        }
    }
    
    
    private func observeAuthorizationUpdates() {
        Task {
            for await _ in alarmManager.authorizationUpdates {
                try await self.checkAuthorization()
            }
        }
    }
}
