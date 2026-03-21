import {
  View, Text, Pressable, StyleSheet, TextInput,
  Modal, Platform, KeyboardAvoidingView, Animated,
  ScrollView,
} from "react-native";
import { useState, useRef, useCallback, useEffect } from "react";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useColors } from "@/hooks/use-colors";
import * as Haptics from "expo-haptics";

// ─── Form state ───────────────────────────────────────────────────────────────
interface FormData {
  firstName: string;
  lastName: string;
  email: string;
  age: string;
  primaryGoals: string[];
  goalTimeline: string;
  whyNow: string;
  biggestChallenges: string[];
  triedBefore: string;
  whatStopped: string;
  dailyRoutine: string;
  workSchedule: string;
  supportSystem: string;
  hoursPerWeek: string;
  investmentReadiness: string;
  coachingStyle: string;
  additionalInfo: string;
}

const EMPTY: FormData = {
  firstName: "", lastName: "", email: "", age: "",
  primaryGoals: [], goalTimeline: "", whyNow: "",
  biggestChallenges: [], triedBefore: "", whatStopped: "",
  dailyRoutine: "", workSchedule: "", supportSystem: "",
  hoursPerWeek: "", investmentReadiness: "", coachingStyle: "",
  additionalInfo: "",
};

// ─── Question definitions ─────────────────────────────────────────────────────
type QType = "name" | "text" | "email" | "number" | "chips-multi" | "chips-single" | "textarea";

interface Question {
  id: keyof FormData | "name_pair";
  type: QType;
  question: string;
  subtitle?: string;
  placeholder?: string;
  options?: string[];
  required?: boolean;
}

const QUESTIONS: Question[] = [
  {
    id: "name_pair",
    type: "name",
    question: "What's your name?",
    subtitle: "Let's make this personal.",
    required: true,
  },
  {
    id: "email",
    type: "email",
    question: "What's your email address?",
    subtitle: "We'll use this to reach you for your intro call.",
    placeholder: "you@example.com",
    required: true,
  },
  {
    id: "age",
    type: "number",
    question: "How old are you?",
    placeholder: "28",
    required: false,
  },
  {
    id: "primaryGoals",
    type: "chips-multi",
    question: "What are you trying to achieve?",
    subtitle: "Select everything that applies.",
    options: [
      "Build consistent habits", "Lose weight / get fit", "Grow my business",
      "Improve mental health", "Advance my career", "Improve relationships",
      "Financial freedom", "Quit a bad habit", "Find my purpose", "Other",
    ],
    required: true,
  },
  {
    id: "goalTimeline",
    type: "chips-single",
    question: "What's your ideal timeline?",
    subtitle: "When do you want to see real results?",
    options: ["1 month", "3 months", "6 months", "1 year", "Ongoing"],
    required: false,
  },
  {
    id: "whyNow",
    type: "textarea",
    question: "Why is this important to you right now?",
    subtitle: "What's driving you to make a change at this moment in your life?",
    placeholder: "Be honest — the more you share, the better we can help...",
    required: false,
  },
  {
    id: "biggestChallenges",
    type: "chips-multi",
    question: "What's been holding you back?",
    subtitle: "Select your biggest obstacles.",
    options: [
      "Lack of motivation", "No clear plan", "Procrastination",
      "Self-doubt / mindset", "Time management", "No accountability",
      "Overwhelm / stress", "Inconsistency", "Fear of failure", "Other",
    ],
    required: false,
  },
  {
    id: "triedBefore",
    type: "textarea",
    question: "Have you tried working toward this goal before?",
    subtitle: "What did you try? What worked, what didn't?",
    placeholder: "Tell us about your past attempts...",
    required: false,
  },
  {
    id: "whatStopped",
    type: "textarea",
    question: "What stopped you from reaching your goal in the past?",
    subtitle: "Honesty here helps us help you.",
    placeholder: "Be real with us — no judgment...",
    required: false,
  },
  {
    id: "dailyRoutine",
    type: "textarea",
    question: "Describe your typical day.",
    subtitle: "Walk us through a weekday from morning to night.",
    placeholder: "Wake up at 7am, commute, work until 6pm...",
    required: false,
  },
  {
    id: "workSchedule",
    type: "chips-single",
    question: "What best describes your work situation?",
    options: [
      "9–5 office job", "Remote / flexible", "Shift work",
      "Self-employed", "Student", "Stay-at-home parent",
    ],
    required: false,
  },
  {
    id: "supportSystem",
    type: "textarea",
    question: "Do you have a support system?",
    subtitle: "Tell us about the people in your corner — family, friends, partner.",
    placeholder: "My partner is supportive but...",
    required: false,
  },
  {
    id: "hoursPerWeek",
    type: "chips-single",
    question: "How many hours per week can you commit?",
    subtitle: "Be realistic — consistency beats intensity.",
    options: ["1–2 hrs/week", "3–5 hrs/week", "6–10 hrs/week", "10+ hrs/week"],
    required: false,
  },
  {
    id: "investmentReadiness",
    type: "chips-single",
    question: "How do you feel about investing in coaching?",
    options: [
      "I'm exploring options",
      "I'm ready to invest in myself",
      "Budget is a concern",
      "I'm fully committed, cost isn't an issue",
    ],
    required: false,
  },
  {
    id: "coachingStyle",
    type: "chips-single",
    question: "What coaching style works best for you?",
    subtitle: "There's no wrong answer — we match you to your coach.",
    options: [
      "Gentle & supportive",
      "Direct & no-nonsense",
      "Data-driven & structured",
      "Flexible & intuitive",
    ],
    required: false,
  },
  {
    id: "additionalInfo",
    type: "textarea",
    question: "Anything else we should know?",
    subtitle: "Health conditions, past experiences, specific concerns, or what you're most excited about.",
    placeholder: "Share anything that feels important...",
    required: false,
  },
];

const TOTAL = QUESTIONS.length;

// ─── Chip component ───────────────────────────────────────────────────────────
function Chip({ label, active, onPress, colors }: { label: string; active: boolean; onPress: () => void; colors: any }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        chipSt.chip,
        {
          borderColor: active ? colors.primary : colors.border,
          backgroundColor: active ? colors.primary + "20" : colors.surface,
          opacity: pressed ? 0.75 : 1,
        },
      ]}
    >
      {active && <IconSymbol name="checkmark" size={13} color={colors.primary} />}
      <Text style={[chipSt.label, { color: active ? colors.primary : colors.foreground }]}>{label}</Text>
    </Pressable>
  );
}

const chipSt = StyleSheet.create({
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 11,
    borderRadius: 24,
    borderWidth: 1.5,
    marginBottom: 0,
  },
  label: { fontSize: 15, fontWeight: "500" },
});

// ─── Main modal ───────────────────────────────────────────────────────────────
interface Props { visible: boolean; onClose: () => void; }

export default function CoachApplyModal({ visible, onClose }: Props) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<FormData>(EMPTY);
  const [submitted, setSubmitted] = useState(false);
  const fadeAnim = useRef(new Animated.Value(1)).current;
  const slideAnim = useRef(new Animated.Value(0)).current;

  const q = QUESTIONS[step];
  const progress = (step + 1) / TOTAL;

  // Animate transition between questions
  function animateToNext(forward: boolean, callback: () => void) {
    const outX = forward ? -30 : 30;
    const inX = forward ? 30 : -30;
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 0, duration: 150, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: outX, duration: 150, useNativeDriver: true }),
    ]).start(() => {
      callback();
      slideAnim.setValue(inX);
      Animated.parallel([
        Animated.timing(fadeAnim, { toValue: 1, duration: 200, useNativeDriver: true }),
        Animated.timing(slideAnim, { toValue: 0, duration: 200, useNativeDriver: true }),
      ]).start();
    });
  }

  function goNext() {
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (step < TOTAL - 1) {
      animateToNext(true, () => setStep((s) => s + 1));
    } else {
      handleSubmit();
    }
  }

  function goBack() {
    if (step > 0) {
      animateToNext(false, () => setStep((s) => s - 1));
    } else {
      handleClose();
    }
  }

  function handleSubmit() {
    if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setSubmitted(true);
  }

  function handleClose() {
    setStep(0);
    setForm(EMPTY);
    setSubmitted(false);
    onClose();
  }

  // Field updaters
  const setField = useCallback((key: keyof FormData, val: string) => {
    setForm((f) => ({ ...f, [key]: val }));
  }, []);

  const toggleChip = useCallback((key: keyof FormData, val: string, multi: boolean) => {
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setForm((f) => {
      if (!multi) return { ...f, [key]: val };
      const arr = (f[key] as string[]).slice();
      const idx = arr.indexOf(val);
      if (idx >= 0) arr.splice(idx, 1);
      else arr.push(val);
      return { ...f, [key]: arr };
    });
  }, []);

  const topPad = Math.max(insets.top, Platform.OS === "web" ? 48 : 44);

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen" onRequestClose={handleClose}>
      <View style={[st.root, { backgroundColor: colors.background }]}>
        {/* Status bar spacer */}
        <View style={{ height: topPad }} />

        {/* Top bar */}
        <View style={st.topBar}>
          <Pressable onPress={goBack} style={({ pressed }) => [st.iconBtn, { backgroundColor: colors.surface, opacity: pressed ? 0.6 : 1 }]}>
            <IconSymbol name="chevron.left" size={20} color={colors.foreground} />
          </Pressable>

          {!submitted && (
            <View style={[st.progressTrack, { backgroundColor: colors.border }]}>
              <View style={[st.progressFill, { width: `${progress * 100}%` as any, backgroundColor: colors.primary }]} />
            </View>
          )}

          <Pressable onPress={handleClose} style={({ pressed }) => [st.iconBtn, { opacity: pressed ? 0.6 : 1 }]}>
            <IconSymbol name="xmark" size={18} color={colors.muted} />
          </Pressable>
        </View>

        {submitted ? (
          // ── Success ──────────────────────────────────────────────────────────
          <View style={st.successWrap}>
            <View style={[st.successCircle, { backgroundColor: colors.success + "20" }]}>
              <IconSymbol name="checkmark.circle.fill" size={64} color={colors.success} />
            </View>
            <Text style={[st.successTitle, { color: colors.foreground }]}>Application Received!</Text>
            <Text style={[st.successSub, { color: colors.muted }]}>
              Our coaching team will review your application and reach out within 24–48 hours to schedule your free intro call.
            </Text>
            <Pressable
              onPress={handleClose}
              style={({ pressed }) => [st.ctaBtn, { backgroundColor: colors.primary, opacity: pressed ? 0.85 : 1 }]}
            >
              <Text style={st.ctaBtnText}>Back to App</Text>
            </Pressable>
          </View>
        ) : (
          // ── Question ──────────────────────────────────────────────────────────
          <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
            <Animated.View
              style={[st.questionWrap, { opacity: fadeAnim, transform: [{ translateX: slideAnim }] }]}
            >
              <ScrollView
                contentContainerStyle={[st.scroll, { paddingBottom: insets.bottom + 80 }]}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
              >
                {/* Step counter */}
                <Text style={[st.counter, { color: colors.muted }]}>{step + 1} / {TOTAL}</Text>

                {/* Question */}
                <Text style={[st.questionText, { color: colors.foreground }]}>{q.question}</Text>
                {q.subtitle && (
                  <Text style={[st.subtitle, { color: colors.muted }]}>{q.subtitle}</Text>
                )}

                {/* Input area */}
                <View style={st.inputArea}>
                  {/* Name pair */}
                  {q.type === "name" && (
                    <View style={{ gap: 12 }}>
                      <TextInput
                        value={form.firstName}
                        onChangeText={(v) => setField("firstName", v)}
                        placeholder="First name"
                        placeholderTextColor={colors.muted + "88"}
                        style={[st.textInput, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.surface }, Platform.OS === "web" ? ({ outlineWidth: 0 } as any) : {}]}
                        autoFocus
                        returnKeyType="next"
                      />
                      <TextInput
                        value={form.lastName}
                        onChangeText={(v) => setField("lastName", v)}
                        placeholder="Last name"
                        placeholderTextColor={colors.muted + "88"}
                        style={[st.textInput, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.surface }, Platform.OS === "web" ? ({ outlineWidth: 0 } as any) : {}]}
                        returnKeyType="done"
                        onSubmitEditing={goNext}
                      />
                    </View>
                  )}

                  {/* Email */}
                  {q.type === "email" && (
                    <TextInput
                      value={form[q.id as keyof FormData] as string}
                      onChangeText={(v) => setField(q.id as keyof FormData, v)}
                      placeholder={q.placeholder}
                      placeholderTextColor={colors.muted + "88"}
                      keyboardType="email-address"
                      autoCapitalize="none"
                      autoFocus
                      returnKeyType="done"
                      onSubmitEditing={goNext}
                      style={[st.textInput, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.surface }, Platform.OS === "web" ? ({ outlineWidth: 0 } as any) : {}]}
                    />
                  )}

                  {/* Number */}
                  {q.type === "number" && (
                    <TextInput
                      value={form[q.id as keyof FormData] as string}
                      onChangeText={(v) => setField(q.id as keyof FormData, v)}
                      placeholder={q.placeholder}
                      placeholderTextColor={colors.muted + "88"}
                      keyboardType="number-pad"
                      autoFocus
                      returnKeyType="done"
                      onSubmitEditing={goNext}
                      style={[st.textInput, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.surface }, Platform.OS === "web" ? ({ outlineWidth: 0 } as any) : {}]}
                    />
                  )}

                  {/* Textarea */}
                  {q.type === "textarea" && (
                    <TextInput
                      value={form[q.id as keyof FormData] as string}
                      onChangeText={(v) => setField(q.id as keyof FormData, v)}
                      placeholder={q.placeholder}
                      placeholderTextColor={colors.muted + "88"}
                      multiline
                      numberOfLines={5}
                      autoFocus
                      textAlignVertical="top"
                      style={[st.textarea, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.surface }, Platform.OS === "web" ? ({ outlineWidth: 0 } as any) : {}]}
                    />
                  )}

                  {/* Chips multi */}
                  {q.type === "chips-multi" && (
                    <View style={st.chipsWrap}>
                      {q.options!.map((opt) => (
                        <Chip
                          key={opt}
                          label={opt}
                          active={(form[q.id as keyof FormData] as string[]).includes(opt)}
                          onPress={() => toggleChip(q.id as keyof FormData, opt, true)}
                          colors={colors}
                        />
                      ))}
                    </View>
                  )}

                  {/* Chips single */}
                  {q.type === "chips-single" && (
                    <View style={st.chipsWrap}>
                      {q.options!.map((opt) => (
                        <Chip
                          key={opt}
                          label={opt}
                          active={form[q.id as keyof FormData] === opt}
                          onPress={() => toggleChip(q.id as keyof FormData, opt, false)}
                          colors={colors}
                        />
                      ))}
                    </View>
                  )}
                </View>
              </ScrollView>
            </Animated.View>

            {/* Bottom Continue button */}
            <View style={[st.bottomBar, { paddingBottom: insets.bottom + 16, backgroundColor: colors.background }]}>
              <Pressable
                onPress={goNext}
                style={({ pressed }) => [st.ctaBtn, { backgroundColor: colors.primary, opacity: pressed ? 0.85 : 1, flex: 1 }]}
              >
                <Text style={st.ctaBtnText}>
                  {step === TOTAL - 1 ? "Submit Application" : "Continue"}
                </Text>
                <IconSymbol
                  name={step === TOTAL - 1 ? "checkmark" : "arrow.right"}
                  size={18}
                  color="#ffffff"
                />
              </Pressable>
            </View>
          </KeyboardAvoidingView>
        )}
      </View>
    </Modal>
  );
}

const st = StyleSheet.create({
  root: { flex: 1 },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 8,
    gap: 12,
  },
  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  progressTrack: {
    flex: 1,
    height: 4,
    borderRadius: 2,
    overflow: "hidden",
  },
  progressFill: {
    height: 4,
    borderRadius: 2,
  },
  questionWrap: {
    flex: 1,
  },
  scroll: {
    padding: 24,
    paddingTop: 32,
    gap: 0,
  },
  counter: {
    fontSize: 13,
    fontWeight: "600",
    marginBottom: 16,
    letterSpacing: 0.5,
  },
  questionText: {
    fontSize: 26,
    fontWeight: "800",
    lineHeight: 34,
    letterSpacing: -0.5,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 15,
    lineHeight: 22,
    marginBottom: 28,
  },
  inputArea: {
    gap: 12,
  },
  textInput: {
    borderWidth: 1.5,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 17,
  },
  textarea: {
    borderWidth: 1.5,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    minHeight: 140,
  },
  chipsWrap: {
    gap: 10,
  },
  bottomBar: {
    flexDirection: "row",
    paddingHorizontal: 20,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  ctaBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 16,
    borderRadius: 14,
  },
  ctaBtnText: {
    color: "#ffffff",
    fontSize: 17,
    fontWeight: "700",
  },
  successWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 32,
    gap: 16,
  },
  successCircle: {
    width: 110,
    height: 110,
    borderRadius: 55,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  successTitle: {
    fontSize: 28,
    fontWeight: "800",
    textAlign: "center",
  },
  successSub: {
    fontSize: 15,
    lineHeight: 23,
    textAlign: "center",
    maxWidth: 320,
  },
});
