//
//  IconMetadata.swift
//  ItsukiAlarm
//
//  Created by Itsuki on 2025/06/15.
//

import AlarmKit

// AlarmMetadata: https://developer.apple.com/documentation/alarmkit/alarmmetadata
// A metadata object that contains information about an alarm.
// Provide an implementation of this for your own custom content or other information. The implementation can be empty if you don’t want to provide any additional data for your alarm UI.
nonisolated struct _AlarmMetadata: AlarmMetadata {
    var icon: Icon
    var title: String
    var createdAt: Date = Date()
    
    enum Icon: String, Codable, CaseIterable {
        case sun = "sun.max.fill"
        case moonStar = "moon.stars.fill"
        case sparkles = "sparkles"
        case rainbow = "rainbow"
        case drop = "drop.degreesign.fill"
        case flame = "flame"
        
        var title: String {
            switch self {
            case .sun: return "Sun"
            case .moonStar: return "Moon"
            case .sparkles: return "Sparkles"
            case .rainbow: return "Rainbow"
            case .drop: return "Drop"
            case .flame: return "Flame"
            }
        }
    }
    
    static var alarmDefaultMetadata: Self {
        .init(icon: .sun, title: "Alarm")
    }
    
    static var timerDefaultMetadata: Self {
        .init(icon: .sun, title: "Timer")
    }
    
    static var customDefaultMetadata: Self {
        .init(icon: .sun, title: "Custom")
    }
    
    static func defaultMetadata(for type: ItsukiAlarmType) -> Self {
        switch type {
        case .alarm:
            return .alarmDefaultMetadata
        case .timer:
            return .timerDefaultMetadata
        case .custom:
            return .customDefaultMetadata
        }
    }

}
