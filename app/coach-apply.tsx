import {
  View, Text, Pressable, StyleSheet, TextInput,
  Modal, Platform, KeyboardAvoidingView, Animated,
  ScrollView, ActivityIndicator,
} from "react-native";
import { useState, useRef, useCallback } from "react";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useColors } from "@/hooks/use-colors";
import * as Haptics from "expo-haptics";
import { trpc } from "@/lib/trpc";

// ─── Form state ───────────────────────────────────────────────────────────────
interface FormData {
  firstName: string;
  lastName: string;
  email: string;
  age: string;
  specificHabit: string;
  habitDirection: string;
  primaryGoals: string[];
  whyNow: string;
  biggestChallenges: string[];
  whatStopped: string;
  workSchedule: string;
  hoursPerWeek: string;
  coachingStyle: string;
  additionalInfo: string;
}

const EMPTY: FormData = {
  firstName: "", lastName: "", email: "", age: "",
  specificHabit: "", habitDirection: "",
  primaryGoals: [], whyNow: "",
  biggestChallenges: [], whatStopped: "",
  workSchedule: "", hoursPerWeek: "", coachingStyle: "",
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
    subtitle: "We'll use this to reach you about your spot.",
    placeholder: "you@example.com",
    required: true,
  },
  {
    id: "habitDirection",
    type: "chips-single",
    question: "Are you trying to start something or stop something?",
    subtitle: "Be honest — both are valid.",
    options: ["Start a new habit", "Stop a bad habit", "Both"],
    required: true,
  },
  {
    id: "specificHabit",
    type: "textarea",
    question: "What is the exact habit?",
    subtitle: "Don't say 'get healthy' — say exactly what you want to do or stop doing. The more specific, the better.",
    placeholder: "e.g. Wake up at 6am every day without hitting snooze\ne.g. Stop scrolling my phone in bed after 10pm\ne.g. Work out for 30 minutes every morning before work",
    required: true,
  },
  {
    id: "primaryGoals",
    type: "chips-multi",
    question: "What does nailing this habit unlock for you?",
    subtitle: "Select everything that applies.",
    options: [
      "More energy & health", "Weight loss / fitness", "Business growth",
      "Mental clarity & focus", "Career advancement", "Better relationships",
      "Financial progress", "Confidence & self-worth", "Less stress", "Other",
    ],
    required: true,
  },
  {
    id: "whyNow",
    type: "textarea",
    question: "Why is this the moment you're finally doing it?",
    subtitle: "Something shifted. What was it?",
    placeholder: "Be honest — the more you share, the better we can help...",
    required: false,
  },
  {
    id: "biggestChallenges",
    type: "chips-multi",
    question: "What's been stopping you until now?",
    subtitle: "Select your biggest obstacles.",
    options: [
      "Lack of motivation", "No clear plan", "Procrastination",
      "Self-doubt / mindset", "Time management", "No accountability",
      "Overwhelm / stress", "Inconsistency", "Fear of failure", "Other",
    ],
    required: false,
  },
  {
    id: "whatStopped",
    type: "textarea",
    question: "You've probably tried before. What happened?",
    subtitle: "What did you try? Why didn't it stick?",
    placeholder: "Be real with us — no judgment...",
    required: false,
  },
  {
    id: "workSchedule",
    type: "chips-single",
    question: "What best describes your work situation?",
    subtitle: "This helps us understand your daily structure.",
    options: [
      "9–5 office job", "Remote / flexible", "Shift work",
      "Self-employed", "Student", "Stay-at-home parent",
    ],
    required: false,
  },
  {
    id: "hoursPerWeek",
    type: "chips-single",
    question: "How many minutes per day can you realistically commit?",
    subtitle: "Be honest — 2 minutes beats 0 minutes every time.",
    options: ["2–5 min/day", "10–15 min/day", "20–30 min/day", "1+ hour/day"],
    required: false,
  },
  {
    id: "coachingStyle",
    type: "chips-single",
    question: "How do you want your coach to show up?",
    subtitle: "There's no wrong answer.",
    options: [
      "Warm & encouraging",
      "Direct & no-nonsense",
      "Structured & data-driven",
      "Flexible & intuitive",
    ],
    required: false,
  },
  {
    id: "additionalInfo",
    type: "textarea",
    question: "Anything else we should know?",
    subtitle: "Health conditions, past experiences, or what you're most excited about.",
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

type ScreenState = "form" | "loading" | "pitch" | "success";

export default function CoachApplyModal({ visible, onClose }: Props) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<FormData>(EMPTY);
  const [screen, setScreen] = useState<ScreenState>("form");
  const [pitch, setPitch] = useState("");
  const fadeAnim = useRef(new Animated.Value(1)).current;
  const slideAnim = useRef(new Animated.Value(0)).current;

  const generatePitchMutation = trpc.coach.generatePitch.useMutation();

  const q = QUESTIONS[step];
  const progress = (step + 1) / TOTAL;

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
    if (screen === "pitch") { setScreen("form"); return; }
    if (step > 0) {
      animateToNext(false, () => setStep((s) => s - 1));
    } else {
      handleClose();
    }
  }

  async function handleSubmit() {
    if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setScreen("loading");
    try {
      const result = await generatePitchMutation.mutateAsync({
        firstName: form.firstName,
        specificHabit: form.specificHabit,
        habitDirection: form.habitDirection,
        primaryGoals: form.primaryGoals,
        whyNow: form.whyNow,
        biggestChallenges: form.biggestChallenges,
        whatStopped: form.whatStopped,
        workSchedule: form.workSchedule,
        hoursPerWeek: form.hoursPerWeek,
        coachingStyle: form.coachingStyle,
      });
      setPitch(result.pitch);
      setScreen("pitch");
    } catch {
      setScreen("success");
    }
  }

  function handleClose() {
    setStep(0);
    setForm(EMPTY);
    setScreen("form");
    setPitch("");
    onClose();
  }

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
        <View style={{ height: topPad }} />

        {/* Top bar */}
        <View style={st.topBar}>
          <Pressable onPress={goBack} style={({ pressed }) => [st.iconBtn, { backgroundColor: colors.surface, opacity: pressed ? 0.6 : 1 }]}>
            <IconSymbol name="chevron.left" size={20} color={colors.foreground} />
          </Pressable>
          {screen === "form" ? (
            <View style={[st.progressTrack, { backgroundColor: colors.border }]}>
              <View style={[st.progressFill, { width: `${progress * 100}%` as any, backgroundColor: colors.primary }]} />
            </View>
          ) : (
            <View style={{ flex: 1 }} />
          )}
          <Pressable onPress={handleClose} style={({ pressed }) => [st.iconBtn, { opacity: pressed ? 0.6 : 1 }]}>
            <IconSymbol name="xmark" size={18} color={colors.muted} />
          </Pressable>
        </View>

        {/* ── Loading ──────────────────────────────────────────────────────── */}
        {screen === "loading" && (
          <View style={st.centeredWrap}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={[st.loadingTitle, { color: colors.foreground }]}>
              Building your Sprint plan...
            </Text>
            <Text style={[st.loadingSubtitle, { color: colors.muted }]}>
              Reviewing your answers and crafting something specific to you.
            </Text>
          </View>
        )}

        {/* ── Pitch / Checkout ─────────────────────────────────────────────── */}
        {screen === "pitch" && (
          <>
            <ScrollView
              contentContainerStyle={[st.pitchScroll, { paddingBottom: insets.bottom + 120 }]}
              showsVerticalScrollIndicator={false}
            >
              {/* Eyebrow */}
              <Text style={[st.eyebrow, { color: colors.primary }]}>
                YOUR 8-WEEK SPRINT PLAN, {(form.firstName || "FRIEND").toUpperCase()}
              </Text>

              {/* Personalized pitch */}
              <Text style={[st.pitchText, { color: colors.foreground }]}>
                {pitch}
              </Text>

              <View style={[st.divider, { backgroundColor: colors.border }]} />

              {/* What's included */}
              <Text style={[st.sectionTitle, { color: colors.foreground }]}>What you get</Text>

              <View style={[st.featureCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <View style={st.featureRow}>
                  <View style={[st.featureDot, { backgroundColor: colors.primary }]} />
                  <View style={{ flex: 1 }}>
                    <Text style={[st.featureTitle, { color: colors.foreground }]}>One Live Group Kickoff Workshop</Text>
                    <Text style={[st.featureSub, { color: colors.muted }]}>60-minute Zoom. Lock in your goals, build your plan inside the app, and get clear on exactly what you're doing for 8 weeks.</Text>
                  </View>
                </View>
                <View style={st.featureRow}>
                  <View style={[st.featureDot, { backgroundColor: colors.primary }]} />
                  <View style={{ flex: 1 }}>
                    <Text style={[st.featureTitle, { color: colors.foreground }]}>Daily Check-Ins (2–3 min)</Text>
                    <Text style={[st.featureSub, { color: colors.muted }]}>Open the app, check off your habit, answer two quick prompts. That's it. No homework, no fluff.</Text>
                  </View>
                </View>
                <View style={st.featureRow}>
                  <View style={[st.featureDot, { backgroundColor: colors.primary }]} />
                  <View style={{ flex: 1 }}>
                    <Text style={[st.featureTitle, { color: colors.foreground }]}>Personal Voice Feedback from Your Coach</Text>
                    <Text style={[st.featureSub, { color: colors.muted }]}>Mon–Fri, your coach reviews your data and sends you a 1–2 minute voice memo. Specific, actionable, personal.</Text>
                  </View>
                </View>
                <View style={[st.featureRow, { borderBottomWidth: 0, paddingBottom: 0 }]}>
                  <View style={[st.featureDot, { backgroundColor: colors.primary }]} />
                  <View style={{ flex: 1 }}>
                    <Text style={[st.featureTitle, { color: colors.foreground }]}>Weekly Strategy Summary</Text>
                    <Text style={[st.featureSub, { color: colors.muted }]}>Every week, your coach identifies the pattern in your data and tells you exactly what to adjust for the next 7 days.</Text>
                  </View>
                </View>
              </View>

              {/* Promise */}
              <View style={[st.promiseCard, { backgroundColor: colors.primary + "12", borderColor: colors.primary + "30" }]}>
                <Text style={[st.promiseText, { color: colors.foreground }]}>
                  "In 8 weeks you will be the person who shows up for their goals — not just writes them down."
                </Text>
              </View>

              {/* Pricing */}
              <View style={[st.pricingCard, { backgroundColor: colors.surface, borderColor: colors.primary + "50" }]}>
                <Text style={[st.pricingLabel, { color: colors.muted }]}>8-WEEK ACCOUNTABILITY SPRINT</Text>
                <View style={st.pricingRow}>
                  <Text style={[st.pricingAmount, { color: colors.foreground }]}>$297</Text>
                  <Text style={[st.pricingPer, { color: colors.muted }]}> one-time</Text>
                </View>
                <Text style={[st.pricingNote, { color: colors.muted }]}>
                  One kickoff call. Tight structure. Everything else happens inside the app.
                </Text>
              </View>

              {/* Social proof */}
              <Text style={[st.quote, { color: colors.muted }]}>
                "I'd been trying to build this habit for two years. Eight weeks with a coach and I haven't missed a day since."
              </Text>
              <Text style={[st.quoteAuthor, { color: colors.muted }]}>— Marcus T., Sprint graduate</Text>
            </ScrollView>

            {/* CTA */}
            <View style={[st.bottomBar, { paddingBottom: insets.bottom + 16, backgroundColor: colors.background }]}>
              <Pressable
                onPress={() => {
                  if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                  setScreen("success");
                }}
                style={({ pressed }) => [st.ctaBtn, { backgroundColor: colors.primary, opacity: pressed ? 0.85 : 1, flex: 1 }]}
              >
                <Text style={st.ctaBtnText}>Claim My Spot — $297</Text>
                <IconSymbol name="arrow.right" size={18} color="#ffffff" />
              </Pressable>
            </View>
          </>
        )}

        {/* ── Success ──────────────────────────────────────────────────────── */}
        {screen === "success" && (
          <View style={st.successWrap}>
            <View style={[st.successCircle, { backgroundColor: colors.success + "20" }]}>
              <IconSymbol name="checkmark.circle.fill" size={64} color={colors.success} />
            </View>
            <Text style={[st.successTitle, { color: colors.foreground }]}>You're in!</Text>
            <Text style={[st.successSub, { color: colors.muted }]}>
              We'll reach out within 24 hours with your kickoff workshop details and next steps.
            </Text>
            <Pressable
              onPress={handleClose}
              style={({ pressed }) => [st.ctaBtn, { backgroundColor: colors.primary, opacity: pressed ? 0.85 : 1, alignSelf: "stretch" }]}
            >
              <Text style={st.ctaBtnText}>Back to App</Text>
            </Pressable>
          </View>
        )}

        {/* ── Form ─────────────────────────────────────────────────────────── */}
        {screen === "form" && (
          <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
            <Animated.View style={[st.questionWrap, { opacity: fadeAnim, transform: [{ translateX: slideAnim }] }]}>
              <ScrollView
                contentContainerStyle={[st.scroll, { paddingBottom: insets.bottom + 80 }]}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
              >
                <Text style={[st.counter, { color: colors.muted }]}>{step + 1} / {TOTAL}</Text>
                <Text style={[st.questionText, { color: colors.foreground }]}>{q.question}</Text>
                {q.subtitle && (
                  <Text style={[st.subtitle, { color: colors.muted }]}>{q.subtitle}</Text>
                )}

                <View style={st.inputArea}>
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
  questionWrap: { flex: 1 },
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
  inputArea: { gap: 12 },
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
  chipsWrap: { gap: 10 },
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
  // Loading
  centeredWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 40,
    gap: 20,
  },
  loadingTitle: {
    fontSize: 22,
    fontWeight: "700",
    textAlign: "center",
  },
  loadingSubtitle: {
    fontSize: 15,
    lineHeight: 22,
    textAlign: "center",
  },
  // Pitch screen
  pitchScroll: {
    padding: 28,
    paddingTop: 24,
    gap: 0,
  },
  eyebrow: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 2,
    marginBottom: 16,
  },
  pitchText: {
    fontSize: 20,
    lineHeight: 32,
    fontWeight: "400",
    letterSpacing: -0.2,
    marginBottom: 32,
  },
  divider: {
    height: 1,
    marginBottom: 28,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: "700",
    marginBottom: 16,
  },
  featureCard: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 20,
    marginBottom: 24,
    gap: 0,
  },
  featureRow: {
    flexDirection: "row",
    gap: 14,
    paddingBottom: 16,
    marginBottom: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(128,128,128,0.2)",
  },
  featureDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginTop: 6,
  },
  featureTitle: {
    fontSize: 15,
    fontWeight: "700",
    marginBottom: 4,
  },
  featureSub: {
    fontSize: 14,
    lineHeight: 21,
  },
  promiseCard: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 20,
    marginBottom: 24,
  },
  promiseText: {
    fontSize: 17,
    lineHeight: 26,
    fontWeight: "500",
    fontStyle: "italic",
    textAlign: "center",
  },
  pricingCard: {
    borderWidth: 2,
    borderRadius: 16,
    padding: 20,
    marginBottom: 24,
    gap: 6,
  },
  pricingLabel: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1.5,
    marginBottom: 4,
  },
  pricingRow: {
    flexDirection: "row",
    alignItems: "baseline",
    marginBottom: 8,
  },
  pricingAmount: {
    fontSize: 44,
    fontWeight: "800",
    letterSpacing: -1,
  },
  pricingPer: {
    fontSize: 16,
    fontWeight: "500",
  },
  pricingNote: {
    fontSize: 14,
    lineHeight: 21,
  },
  quote: {
    fontSize: 15,
    lineHeight: 24,
    fontStyle: "italic",
    marginBottom: 6,
  },
  quoteAuthor: {
    fontSize: 13,
    fontWeight: "600",
    marginBottom: 8,
  },
  // Success
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
