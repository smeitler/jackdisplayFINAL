//
//  CountdownLiveActivity.swift
//  CountdownLiveActivity
//
//  Created by Itsuki on 2025/06/16.
//

import ActivityKit
import WidgetKit
import SwiftUI
import AlarmKit
import AppIntents


struct CountdownLiveActivity: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: AlarmAttributes<_AlarmMetadata>.self) { context in
            // Lock screen/banner UI goes here
            let attributes: AlarmAttributes<_AlarmMetadata> = context.attributes
            let state: AlarmPresentationState = context.state
            
            VStack {
                
                HStack( alignment: .bottom ,
                    spacing: 8) {
                    
                    AlarmControls(presentation: attributes.presentation, state: state)
                    
                    HStack(alignment: .lastTextBaseline) {
                        let metadata = attributes.metadata ?? .timerDefaultMetadata
                        
                        let title = metadata.title
                        let icon = metadata.icon
                        
                        Text("\(Image(systemName: icon.rawValue)) \(title.isEmpty ? "Timer" : title)")
                            .font(.system(size: 16))
                            .layoutPriority(3)
                            .multilineTextAlignment(.trailing)
                            .lineLimit(1)
                            .frame(maxWidth: .infinity, alignment: .trailing)
                        
                        TimerDigitsView(totalDuration: nil, presentationMode: state.mode)
                            .font(.system(size: 40, design: .rounded))
                            .multilineTextAlignment(.trailing)
                           
                        
                    }
                    .foregroundStyle(attributes.tintColor)
                    .layoutPriority(1)
                    .frame(maxWidth: .infinity, alignment: .trailing)

                }

            }
            .padding(.all, 16)
            .background(.black.opacity(0.95))
            .widgetURL(state.alarmID.widgetURL)
            
        } dynamicIsland: { context in
            let attributes: AlarmAttributes<_AlarmMetadata> = context.attributes
            let state: AlarmPresentationState = context.state

            return DynamicIsland {
                DynamicIslandExpandedRegion(.leading) {
                    AlarmControls(presentation: attributes.presentation, state: state)
                }
                DynamicIslandExpandedRegion(.trailing) {
                    HStack(alignment: .lastTextBaseline) {
                        Text(attributes.metadata?.title ?? "Timer")
                            .font(.system(size: 12))
                        
                        TimerDigitsView(totalDuration: nil, presentationMode: state.mode)
                            .font(.system(size: 40, design: .rounded))
                            .frame(maxWidth: .infinity)
                        
                    }
                    .foregroundStyle(attributes.tintColor)
                    .dynamicIsland(verticalPlacement: .belowIfTooWide)
                }
            } compactLeading: {
                progressView(tint: attributes.tintColor, mode: state.mode)
                    .padding(.all, 4)
            } compactTrailing: {
                TimerDigitsView(totalDuration: nil, presentationMode: state.mode)
                    .frame(maxWidth: 48)
                    .foregroundStyle(attributes.tintColor)

            } minimal: {
                progressView(tint: attributes.tintColor, mode: state.mode)
                    .padding(.all, 4)
                    .frame(width: 48)
            }
            .keylineTint(attributes.tintColor)
            .widgetURL(state.alarmID.widgetURL)
        }
    }
    
    private func progressView(tint: Color, mode: AlarmPresentationState.Mode) -> some View {
        Group {
            switch mode {
            case .countdown(let countdown):
                let remaining = countdown.totalCountdownDuration - countdown.previouslyElapsedDuration

                ProgressView(
                    timerInterval: countdown.startDate...countdown.startDate.addingTimeInterval(remaining),
                    countsDown: true,
                    label: {},
                    currentValueLabel: {}
                )
                
            case .paused(let pausedState):
                
                let remaining = pausedState.totalCountdownDuration - pausedState.previouslyElapsedDuration
                ProgressView(
                    value: remaining,
                    total: pausedState.totalCountdownDuration,
                    label: { },
                    currentValueLabel: {}
                )
                
            default:
                ProgressView(
                    value: 1,
                    total: 1,
                    label: {},
                    currentValueLabel: {})

            }
        }
        .progressViewStyle(.circular)
        .foregroundStyle(tint)
        .tint(tint)
        .labelsHidden()
    }
}


struct AlarmControls: View {
    var presentation: AlarmPresentation
    var state: AlarmPresentationState
    
    var body: some View {
        let id = state.alarmID
        
        HStack(spacing: 8) {
            switch state.mode {
            case .countdown(_):
                let pauseButton = self.presentation.countdown?.pauseButton
                
                Button(intent: PauseIntent(alarmID: id), label: {
                    self.buttonImage(pauseButton)
                })
                .tint(pauseButton?.textColor.opacity(0.3))
                
            case .paused(_):
                let resumeButton = self.presentation.paused?.resumeButton
                
                Button(intent: ResumeIntent(alarmID: id), label: {
                    self.buttonImage(resumeButton)
                })
                .tint(resumeButton?.textColor.opacity(0.3))

            // timer alerting or alarm snoozing
            case .alert(_):
                if let secondaryButton = self.presentation.alert.secondaryButton {
                    Button(intent: RepeatIntent(alarmID: id), label: {
                        self.buttonImage(secondaryButton)
                            .foregroundStyle(Color.alarmTint)
                    })
                    .tint(Color.alarmTint.opacity(0.3))
                }

            default:
                EmptyView()
            }
            
            Button(intent: StopIntent(alarmID: id), label: {
                self.buttonImage(self.presentation.alert.stopButton)
                    .foregroundStyle(self.presentation.alert.stopButton.textColor)
            })
            .tint(.gray.opacity(0.3))

        }
        .roundButtonStyle()
    }
    
    private func buttonImage(_ alarmButton: AlarmButton?) -> some View {
        Image(systemName: alarmButton?.systemImageName ?? "heart.fill")
            .foregroundStyle(alarmButton?.textColor ?? Color.alarmTint)
            .font(.system(size: 20))
            .fontWeight(.bold)
            .frame(width: 20, height: 20)
            .padding(.all, 4)

    }
}



#Preview("Notification", as: .content, using: AlarmAttributes<_AlarmMetadata>.testAttributes) {
   CountdownLiveActivity()
} contentStates: {
    AlarmAttributes<_AlarmMetadata>.ContentState.testState
}

#Preview("Dynamic Compact", as: .dynamicIsland(.compact), using: AlarmAttributes<_AlarmMetadata>.testAttributes) {
   CountdownLiveActivity()
} contentStates: {
    AlarmAttributes<_AlarmMetadata>.ContentState.testState
}

#Preview("Dynamic Minimal", as: .dynamicIsland(.minimal), using: AlarmAttributes<_AlarmMetadata>.testAttributes) {
   CountdownLiveActivity()
} contentStates: {
    AlarmAttributes<_AlarmMetadata>.ContentState.testState
}

#Preview("Dynamic Expanded", as: .dynamicIsland(.expanded), using: AlarmAttributes<_AlarmMetadata>.testAttributes) {
   CountdownLiveActivity()
} contentStates: {
    AlarmAttributes<_AlarmMetadata>.ContentState.testState
}


private extension AlarmAttributes<_AlarmMetadata>.ContentState {
    static var testState: AlarmAttributes<_AlarmMetadata>.ContentState {
        .init(alarmID: UUID(), mode: .countdown(.init(totalCountdownDuration: 60*60*24, previouslyElapsedDuration: 0, startDate: Date(), fireDate: Date())))
    }
}


private extension AlarmAttributes<_AlarmMetadata> {
    static var testAttributes: Self {
        let title = "title"
        let secondaryBehavior: AlarmPresentation.Alert.SecondaryButtonBehavior? = .countdown
        let secondaryButton: AlarmButton? = .repeatButton
        
        let alert = AlarmPresentation.Alert(
            title: title.isEmpty ? "Alarm" : LocalizedStringResource(stringLiteral: title),
            stopButton: .stopButton,
            secondaryButton: secondaryButton,
            secondaryButtonBehavior: secondaryBehavior
        )


        let countdown = AlarmPresentation.Countdown(
            title: "Counting down...",
            pauseButton: .pauseButton
        )

        let paused = AlarmPresentation.Paused(
            title: "Paused",
            resumeButton: .resumeButton
        )
        
        let metadata = _AlarmMetadata(icon: .drop, title: "Timer")
        let presentation = AlarmPresentation(alert: alert, countdown: countdown, paused: paused)
        let attributes = AlarmAttributes(
            presentation: presentation,
            metadata: metadata,
            // text color are set for each button in AlarmButton
            tintColor: .alarmTint
        )
        
        return attributes
    }
}
