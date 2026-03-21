import {
  View, Text, ScrollView, Pressable, StyleSheet, TextInput,
  Modal, Platform, KeyboardAvoidingView, Alert,
} from "react-native";
import { useState, useCallback } from "react";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useColors } from "@/hooks/use-colors";
import * as Haptics from "expo-haptics";

// ─── Types ───────────────────────────────────────────────────────────────────
interface FormData {
  // Step 1 — About You
  firstName: string;
  lastName: string;
  email: string;
  age: string;
  // Step 2 — Your Goals
  primaryGoal: string;
  otherGoal: string;
  goalTimeline: string;
  whyNow: string;
  // Step 3 — Current Situation
  biggestChallenge: string;
  triedBefore: string;
  whatStopped: string;
  // Step 4 — Lifestyle
  dailyRoutine: string;
  workSchedule: string;
  supportSystem: string;
  // Step 5 — Commitment
  hoursPerWeek: string;
  investmentReadiness: string;
  coachingStyle: string;
  // Step 6 — Anything else
  additionalInfo: string;
}

const EMPTY_FORM: FormData = {
  firstName: "", lastName: "", email: "", age: "",
  primaryGoal: "", otherGoal: "", goalTimeline: "", whyNow: "",
  biggestChallenge: "", triedBefore: "", whatStopped: "",
  dailyRoutine: "", workSchedule: "", supportSystem: "",
  hoursPerWeek: "", investmentReadiness: "", coachingStyle: "",
  additionalInfo: "",
};

// ─── Option chips ─────────────────────────────────────────────────────────────
const GOAL_OPTIONS = [
  "Build consistent habits", "Lose weight / get fit", "Grow my business",
  "Improve mental health", "Advance my career", "Improve relationships",
  "Financial freedom", "Quit a bad habit", "Other",
];

const TIMELINE_OPTIONS = ["1 month", "3 months", "6 months", "1 year", "Ongoing"];

const CHALLENGE_OPTIONS = [
  "Lack of motivation", "No clear plan", "Procrastination",
  "Self-doubt / mindset", "Time management", "Accountability",
  "Overwhelm / stress", "Inconsistency", "Other",
];

const SCHEDULE_OPTIONS = [
  "9–5 office job", "Remote / flexible", "Shift work",
  "Self-employed", "Student", "Stay-at-home parent",
];

const HOURS_OPTIONS = ["1–2 hrs/week", "3–5 hrs/week", "6–10 hrs/week", "10+ hrs/week"];

const INVESTMENT_OPTIONS = [
  "I'm exploring options", "I'm ready to invest in myself",
  "Budget is a concern", "I'm fully committed, cost isn't an issue",
];

const STYLE_OPTIONS = [
  "Gentle & supportive", "Direct & no-nonsense",
  "Data-driven & structured", "Flexible & intuitive",
];

// ─── Step definitions ─────────────────────────────────────────────────────────
const STEPS = [
  { title: "About You", subtitle: "Let's start with the basics.", icon: "person.fill" as const },
  { title: "Your Goals", subtitle: "What do you want to achieve?", icon: "flag.fill" as const },
  { title: "Current Situation", subtitle: "Where are you starting from?", icon: "chart.line.uptrend.xyaxis" as const },
  { title: "Your Lifestyle", subtitle: "Help us understand your world.", icon: "calendar" as const },
  { title: "Commitment", subtitle: "How ready are you?", icon: "bolt.fill" as const },
  { title: "Final Thoughts", subtitle: "Anything else we should know?", icon: "text.bubble.fill" as const },
];

// ─── Chip component ───────────────────────────────────────────────────────────
function Chips({
  options, selected, onToggle, multi = true, colors,
}: {
  options: string[];
  selected: string | string[];
  onToggle: (val: string) => void;
  multi?: boolean;
  colors: any;
}) {
  const isSelected = (v: string) =>
    multi ? (selected as string[]).includes(v) : selected === v;

  return (
    <View style={chipStyles.wrap}>
      {options.map((opt) => {
        const active = isSelected(opt);
        return (
          <Pressable
            key={opt}
            onPress={() => onToggle(opt)}
            style={({ pressed }) => [
              chipStyles.chip,
              { borderColor: active ? colors.primary : colors.border, backgroundColor: active ? colors.primary + "22" : colors.surface, opacity: pressed ? 0.75 : 1 },
            ]}
          >
            <Text style={[chipStyles.chipText, { color: active ? colors.primary : colors.muted }]}>{opt}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const chipStyles = StyleSheet.create({
  wrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1.5 },
  chipText: { fontSize: 13, fontWeight: "600" },
});

// ─── Field component ──────────────────────────────────────────────────────────
function Field({
  label, value, onChange, placeholder, multiline = false, keyboardType = "default", colors,
}: {
  label: string; value: string; onChange: (v: string) => void;
  placeholder?: string; multiline?: boolean; keyboardType?: any; colors: any;
}) {
  return (
    <View style={{ gap: 6 }}>
      <Text style={[fieldStyles.label, { color: colors.foreground }]}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={colors.muted + "88"}
        multiline={multiline}
        numberOfLines={multiline ? 4 : 1}
        keyboardType={keyboardType}
        style={[
          fieldStyles.input,
          multiline && fieldStyles.inputMulti,
          { color: colors.foreground, backgroundColor: colors.surface, borderColor: colors.border },
          Platform.OS === "web" ? ({ outlineWidth: 0 } as any) : {},
        ]}
        textAlignVertical={multiline ? "top" : "center"}
      />
    </View>
  );
}

const fieldStyles = StyleSheet.create({
  label: { fontSize: 14, fontWeight: "600" },
  input: { borderWidth: 1.5, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15 },
  inputMulti: { minHeight: 100, paddingTop: 12 },
});

// ─── Main component ───────────────────────────────────────────────────────────
interface CoachApplyProps {
  visible: boolean;
  onClose: () => void;
}

export default function CoachApplyModal({ visible, onClose }: CoachApplyProps) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<FormData>(EMPTY_FORM);
  const [submitted, setSubmitted] = useState(false);

  const totalSteps = STEPS.length;

  const set = useCallback((key: keyof FormData, val: string) => {
    setForm((f) => ({ ...f, [key]: val }));
  }, []);

  const toggleChip = useCallback((key: keyof FormData, val: string, multi: boolean) => {
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setForm((f) => {
      if (!multi) return { ...f, [key]: val };
      const current = (f[key] as string).split(",").filter(Boolean);
      const idx = current.indexOf(val);
      if (idx >= 0) current.splice(idx, 1);
      else current.push(val);
      return { ...f, [key]: current.join(",") };
    });
  }, []);

  const selectedArr = (key: keyof FormData) =>
    (form[key] as string).split(",").filter(Boolean);

  function goNext() {
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (step < totalSteps - 1) setStep((s) => s + 1);
    else handleSubmit();
  }

  function goBack() {
    if (step > 0) setStep((s) => s - 1);
    else onClose();
  }

  function handleSubmit() {
    if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setSubmitted(true);
  }

  function handleClose() {
    setStep(0);
    setForm(EMPTY_FORM);
    setSubmitted(false);
    onClose();
  }

  const stepInfo = STEPS[step];
  const progress = (step + 1) / totalSteps;

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen" onRequestClose={handleClose}>
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        {/* Status bar spacer */}
        <View style={{ height: Math.max(insets.top, Platform.OS === "web" ? 48 : 44) }} />

        {/* Top bar */}
        <View style={applyStyles.topBar}>
          <Pressable onPress={goBack} style={({ pressed }) => [applyStyles.backBtn, { opacity: pressed ? 0.6 : 1, backgroundColor: colors.surface }]}>
            <IconSymbol name="chevron.left" size={20} color={colors.foreground} />
          </Pressable>
          <Text style={[applyStyles.stepLabel, { color: colors.muted }]}>
            {submitted ? "" : `Step ${step + 1} of ${totalSteps}`}
          </Text>
          <Pressable onPress={handleClose} style={({ pressed }) => [applyStyles.closeBtn, { opacity: pressed ? 0.6 : 1 }]}>
            <IconSymbol name="xmark" size={18} color={colors.muted} />
          </Pressable>
        </View>

        {/* Progress bar */}
        {!submitted && (
          <View style={[applyStyles.progressTrack, { backgroundColor: colors.border }]}>
            <View style={[applyStyles.progressFill, { width: `${progress * 100}%` as any, backgroundColor: colors.primary }]} />
          </View>
        )}

        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
          <ScrollView
            contentContainerStyle={[applyStyles.scroll, { paddingBottom: insets.bottom + 32 }]}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {submitted ? (
              // ── Success screen ──────────────────────────────────────────────
              <View style={applyStyles.successWrap}>
                <View style={[applyStyles.successIcon, { backgroundColor: colors.success + "22" }]}>
                  <IconSymbol name="checkmark.circle.fill" size={56} color={colors.success} />
                </View>
                <Text style={[applyStyles.successTitle, { color: colors.foreground }]}>
                  Application Received!
                </Text>
                <Text style={[applyStyles.successSub, { color: colors.muted }]}>
                  Thank you for applying. A member of our coaching team will review your application and reach out within 24–48 hours to schedule your free intro call.
                </Text>
                <Pressable
                  onPress={handleClose}
                  style={({ pressed }) => [applyStyles.doneBtn, { backgroundColor: colors.primary, opacity: pressed ? 0.85 : 1 }]}
                >
                  <Text style={applyStyles.doneBtnText}>Back to App</Text>
                </Pressable>
              </View>
            ) : (
              // ── Form steps ──────────────────────────────────────────────────
              <View style={{ gap: 24 }}>
                {/* Step header */}
                <View style={applyStyles.stepHeader}>
                  <View style={[applyStyles.stepIconCircle, { backgroundColor: colors.primary + "18" }]}>
                    <IconSymbol name={stepInfo.icon} size={26} color={colors.primary} />
                  </View>
                  <Text style={[applyStyles.stepTitle, { color: colors.foreground }]}>{stepInfo.title}</Text>
                  <Text style={[applyStyles.stepSubtitle, { color: colors.muted }]}>{stepInfo.subtitle}</Text>
                </View>

                {/* ── Step 1: About You ── */}
                {step === 0 && (
                  <View style={{ gap: 16 }}>
                    <View style={applyStyles.row}>
                      <View style={{ flex: 1 }}>
                        <Field label="First Name" value={form.firstName} onChange={(v) => set("firstName", v)} placeholder="Jane" colors={colors} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Field label="Last Name" value={form.lastName} onChange={(v) => set("lastName", v)} placeholder="Smith" colors={colors} />
                      </View>
                    </View>
                    <Field label="Email Address" value={form.email} onChange={(v) => set("email", v)} placeholder="jane@example.com" keyboardType="email-address" colors={colors} />
                    <Field label="Age" value={form.age} onChange={(v) => set("age", v)} placeholder="28" keyboardType="number-pad" colors={colors} />
                  </View>
                )}

                {/* ── Step 2: Goals ── */}
                {step === 1 && (
                  <View style={{ gap: 20 }}>
                    <View style={{ gap: 8 }}>
                      <Text style={[fieldStyles.label, { color: colors.foreground }]}>What is your primary goal? (select all that apply)</Text>
                      <Chips
                        options={GOAL_OPTIONS}
                        selected={selectedArr("primaryGoal")}
                        onToggle={(v) => toggleChip("primaryGoal", v, true)}
                        multi
                        colors={colors}
                      />
                    </View>
                    {selectedArr("primaryGoal").includes("Other") && (
                      <Field label="Describe your goal" value={form.otherGoal} onChange={(v) => set("otherGoal", v)} placeholder="Tell us more..." multiline colors={colors} />
                    )}
                    <View style={{ gap: 8 }}>
                      <Text style={[fieldStyles.label, { color: colors.foreground }]}>What's your ideal timeline to reach this goal?</Text>
                      <Chips
                        options={TIMELINE_OPTIONS}
                        selected={form.goalTimeline}
                        onToggle={(v) => toggleChip("goalTimeline", v, false)}
                        multi={false}
                        colors={colors}
                      />
                    </View>
                    <Field
                      label="Why is this goal important to you right now?"
                      value={form.whyNow}
                      onChange={(v) => set("whyNow", v)}
                      placeholder="What's driving you to make this change now?"
                      multiline
                      colors={colors}
                    />
                  </View>
                )}

                {/* ── Step 3: Current Situation ── */}
                {step === 2 && (
                  <View style={{ gap: 20 }}>
                    <View style={{ gap: 8 }}>
                      <Text style={[fieldStyles.label, { color: colors.foreground }]}>What's your biggest challenge right now?</Text>
                      <Chips
                        options={CHALLENGE_OPTIONS}
                        selected={selectedArr("biggestChallenge")}
                        onToggle={(v) => toggleChip("biggestChallenge", v, true)}
                        multi
                        colors={colors}
                      />
                    </View>
                    <Field
                      label="Have you tried working toward this goal before?"
                      value={form.triedBefore}
                      onChange={(v) => set("triedBefore", v)}
                      placeholder="What did you try? What worked, what didn't?"
                      multiline
                      colors={colors}
                    />
                    <Field
                      label="What has stopped you from reaching this goal in the past?"
                      value={form.whatStopped}
                      onChange={(v) => set("whatStopped", v)}
                      placeholder="Be honest — this helps us help you."
                      multiline
                      colors={colors}
                    />
                  </View>
                )}

                {/* ── Step 4: Lifestyle ── */}
                {step === 3 && (
                  <View style={{ gap: 20 }}>
                    <Field
                      label="Describe your typical daily routine"
                      value={form.dailyRoutine}
                      onChange={(v) => set("dailyRoutine", v)}
                      placeholder="Walk us through a typical weekday from morning to night..."
                      multiline
                      colors={colors}
                    />
                    <View style={{ gap: 8 }}>
                      <Text style={[fieldStyles.label, { color: colors.foreground }]}>What best describes your work schedule?</Text>
                      <Chips
                        options={SCHEDULE_OPTIONS}
                        selected={form.workSchedule}
                        onToggle={(v) => toggleChip("workSchedule", v, false)}
                        multi={false}
                        colors={colors}
                      />
                    </View>
                    <Field
                      label="Do you have a support system? (family, friends, partner)"
                      value={form.supportSystem}
                      onChange={(v) => set("supportSystem", v)}
                      placeholder="Tell us about the people in your corner..."
                      multiline
                      colors={colors}
                    />
                  </View>
                )}

                {/* ── Step 5: Commitment ── */}
                {step === 4 && (
                  <View style={{ gap: 20 }}>
                    <View style={{ gap: 8 }}>
                      <Text style={[fieldStyles.label, { color: colors.foreground }]}>How many hours per week can you dedicate to working on your goals?</Text>
                      <Chips
                        options={HOURS_OPTIONS}
                        selected={form.hoursPerWeek}
                        onToggle={(v) => toggleChip("hoursPerWeek", v, false)}
                        multi={false}
                        colors={colors}
                      />
                    </View>
                    <View style={{ gap: 8 }}>
                      <Text style={[fieldStyles.label, { color: colors.foreground }]}>How do you feel about investing in coaching?</Text>
                      <Chips
                        options={INVESTMENT_OPTIONS}
                        selected={form.investmentReadiness}
                        onToggle={(v) => toggleChip("investmentReadiness", v, false)}
                        multi={false}
                        colors={colors}
                      />
                    </View>
                    <View style={{ gap: 8 }}>
                      <Text style={[fieldStyles.label, { color: colors.foreground }]}>What coaching style works best for you?</Text>
                      <Chips
                        options={STYLE_OPTIONS}
                        selected={form.coachingStyle}
                        onToggle={(v) => toggleChip("coachingStyle", v, false)}
                        multi={false}
                        colors={colors}
                      />
                    </View>
                  </View>
                )}

                {/* ── Step 6: Final Thoughts ── */}
                {step === 5 && (
                  <View style={{ gap: 16 }}>
                    <Field
                      label="Is there anything else you'd like us to know before your intro call?"
                      value={form.additionalInfo}
                      onChange={(v) => set("additionalInfo", v)}
                      placeholder="Share anything that feels important — health conditions, past experiences, specific concerns, or what you're most excited about..."
                      multiline
                      colors={colors}
                    />
                    <View style={[applyStyles.summaryBox, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                      <Text style={[applyStyles.summaryTitle, { color: colors.foreground }]}>What happens next?</Text>
                      <Text style={[applyStyles.summaryText, { color: colors.muted }]}>
                        After you submit, our team reviews your application and matches you with the best coach for your goals. You'll receive a message within 24–48 hours to book your free 30-minute intro call.
                      </Text>
                    </View>
                  </View>
                )}

                {/* Next / Submit button */}
                <Pressable
                  onPress={goNext}
                  style={({ pressed }) => [
                    applyStyles.nextBtn,
                    { backgroundColor: colors.primary, opacity: pressed ? 0.85 : 1 },
                  ]}
                >
                  <Text style={applyStyles.nextBtnText}>
                    {step === totalSteps - 1 ? "Submit Application" : "Continue"}
                  </Text>
                  <IconSymbol name={step === totalSteps - 1 ? "checkmark" : "chevron.right"} size={18} color="#ffffff" />
                </Pressable>
              </View>
            )}
          </ScrollView>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const applyStyles = StyleSheet.create({
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 8,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  closeBtn: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  stepLabel: {
    flex: 1,
    textAlign: "center",
    fontSize: 13,
    fontWeight: "600",
  },
  progressTrack: {
    height: 3,
    marginHorizontal: 0,
  },
  progressFill: {
    height: 3,
    borderRadius: 2,
  },
  scroll: {
    padding: 20,
    gap: 0,
  },
  stepHeader: {
    alignItems: "center",
    gap: 8,
    paddingVertical: 12,
  },
  stepIconCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  stepTitle: {
    fontSize: 24,
    fontWeight: "800",
    letterSpacing: -0.5,
  },
  stepSubtitle: {
    fontSize: 15,
    textAlign: "center",
  },
  row: {
    flexDirection: "row",
    gap: 12,
  },
  nextBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 16,
    borderRadius: 14,
    marginTop: 8,
  },
  nextBtnText: {
    color: "#ffffff",
    fontSize: 17,
    fontWeight: "700",
  },
  summaryBox: {
    padding: 16,
    borderRadius: 14,
    borderWidth: 1,
    gap: 8,
  },
  summaryTitle: {
    fontSize: 15,
    fontWeight: "700",
  },
  summaryText: {
    fontSize: 14,
    lineHeight: 21,
  },
  successWrap: {
    alignItems: "center",
    gap: 16,
    paddingTop: 40,
  },
  successIcon: {
    width: 100,
    height: 100,
    borderRadius: 50,
    alignItems: "center",
    justifyContent: "center",
  },
  successTitle: {
    fontSize: 26,
    fontWeight: "800",
    textAlign: "center",
  },
  successSub: {
    fontSize: 15,
    lineHeight: 23,
    textAlign: "center",
    maxWidth: 320,
  },
  doneBtn: {
    paddingHorizontal: 40,
    paddingVertical: 16,
    borderRadius: 14,
    marginTop: 8,
  },
  doneBtnText: {
    color: "#ffffff",
    fontSize: 17,
    fontWeight: "700",
  },
});
