/**
 * Panel Settings Screen
 * Controls audio, voice, Low EMF mode, and shows device info for the CrowPanel display.
 * 4 sections: Audio, Voice, Low EMF Mode, About
 */
import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  ToastAndroid,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import { trpc } from "@/lib/trpc";
import { useColors } from "@/hooks/use-colors";
import { ScreenContainer } from "@/components/screen-container";
import { IconSymbol } from "@/components/ui/icon-symbol";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatHour12(hour: number): string {
  if (hour === 0) return "12 AM";
  if (hour === 12) return "12 PM";
  return hour < 12 ? `${hour} AM` : `${hour - 12} PM`;
}

function showToast(msg: string) {
  if (Platform.OS === "android") {
    ToastAndroid.show(msg, ToastAndroid.SHORT);
  }
  // iOS: we use a small inline banner (see InlineToast component)
}

// ─── InlineToast ─────────────────────────────────────────────────────────────

function InlineToast({ message, visible }: { message: string; visible: boolean }) {
  const opacity = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (visible) {
      Animated.sequence([
        Animated.timing(opacity, { toValue: 1, duration: 200, useNativeDriver: true }),
        Animated.delay(2200),
        Animated.timing(opacity, { toValue: 0, duration: 300, useNativeDriver: true }),
      ]).start();
    }
  }, [visible, opacity]);
  if (!visible) return null;
  return (
    <Animated.View style={[styles.toast, { opacity }]}>
      <Text style={styles.toastText}>{message}</Text>
    </Animated.View>
  );
}

// ─── Hour Picker ─────────────────────────────────────────────────────────────

function HourPicker({
  label,
  value,
  onChange,
  colors,
}: {
  label: string;
  value: number;
  onChange: (h: number) => void;
  colors: ReturnType<typeof useColors>;
}) {
  const hours = Array.from({ length: 24 }, (_, i) => i);
  return (
    <View style={styles.hourPickerRow}>
      <Text style={[styles.hourPickerLabel, { color: colors.muted }]}>{label}</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.hourPickerScroll}
      >
        {hours.map((h) => {
          const selected = h === value;
          return (
            <Pressable
              key={h}
              onPress={() => {
                if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                onChange(h);
              }}
              style={[
                styles.hourChip,
                {
                  backgroundColor: selected ? colors.primary : colors.surface,
                  borderColor: selected ? colors.primary : colors.border,
                },
              ]}
            >
              <Text
                style={[
                  styles.hourChipText,
                  { color: selected ? "#fff" : colors.foreground },
                ]}
              >
                {formatHour12(h)}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

// ─── Voice Picker ─────────────────────────────────────────────────────────────

const VOICES = [
  { id: "rachel", name: "Rachel", desc: "Warm, clear, professional female" },
  { id: "aria",   name: "Aria",   desc: "Bright, energetic female" },
  { id: "adam",   name: "Adam",   desc: "Deep, calm male" },
  { id: "josh",   name: "Josh",   desc: "Friendly, natural male" },
  { id: "bella",  name: "Bella",  desc: "Soft, soothing female" },
];

function VoicePicker({
  value,
  onChange,
  colors,
}: {
  value: string;
  onChange: (id: string) => void;
  colors: ReturnType<typeof useColors>;
}) {
  return (
    <View style={{ gap: 6 }}>
      {VOICES.map((v) => {
        const selected = v.id === value;
        return (
          <Pressable
            key={v.id}
            onPress={() => {
              if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              onChange(v.id);
            }}
            style={({ pressed }) => [
              styles.voiceRow,
              {
                backgroundColor: selected ? colors.primary + "18" : colors.surface,
                borderColor: selected ? colors.primary : colors.border,
                opacity: pressed ? 0.8 : 1,
              },
            ]}
          >
            <View style={{ flex: 1 }}>
              <Text style={[styles.voiceName, { color: colors.foreground }]}>{v.name}</Text>
              <Text style={[styles.voiceDesc, { color: colors.muted }]}>{v.desc}</Text>
            </View>
            {selected && (
              <IconSymbol name="checkmark.circle.fill" size={20} color={colors.primary} />
            )}
          </Pressable>
        );
      })}
    </View>
  );
}

// ─── Section Card ─────────────────────────────────────────────────────────────

function SectionCard({
  title,
  icon,
  iconColor,
  children,
  colors,
}: {
  title: string;
  icon: string;
  iconColor: string;
  children: React.ReactNode;
  colors: ReturnType<typeof useColors>;
}) {
  return (
    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <View style={styles.cardHeader}>
        <View style={[styles.cardIconWrap, { backgroundColor: iconColor + "22" }]}>
          <IconSymbol name={icon as never} size={18} color={iconColor} />
        </View>
        <Text style={[styles.cardTitle, { color: colors.foreground }]}>{title}</Text>
      </View>
      <View style={styles.cardBody}>{children}</View>
    </View>
  );
}

// ─── Toggle Row ───────────────────────────────────────────────────────────────

function ToggleRow({
  label,
  value,
  onValueChange,
  colors,
}: {
  label: string;
  value: boolean;
  onValueChange: (v: boolean) => void;
  colors: ReturnType<typeof useColors>;
}) {
  return (
    <View style={styles.toggleRow}>
      <Text style={[styles.toggleLabel, { color: colors.foreground }]}>{label}</Text>
      <Switch
        value={value}
        onValueChange={(v) => {
          if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          onValueChange(v);
        }}
        trackColor={{ false: colors.border, true: colors.primary }}
        thumbColor="#fff"
      />
    </View>
  );
}

// ─── Main Screen ─────────────────────────────────────────────────────────────

export default function PanelSettingsScreen() {
  const colors = useColors();
  const router = useRouter();

  const settingsQuery = trpc.devices.getSettings.useQuery();
  const devicesQuery = trpc.devices.list.useQuery();
  const updateMutation = trpc.devices.updateSettings.useMutation();

  const [toastMsg, setToastMsg] = useState("");
  const [toastVisible, setToastVisible] = useState(false);

  // Local state mirrors server state
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [voiceEnabled, setVoiceEnabled] = useState(false);
  const [voiceId, setVoiceId] = useState("rachel");
  const [lowEmfMode, setLowEmfMode] = useState(false);
  const [wifiOffHour, setWifiOffHour] = useState(22);
  const [wifiOnHour, setWifiOnHour] = useState(6);

  // Sync from server on load
  useEffect(() => {
    if (!settingsQuery.data) return;
    const s = settingsQuery.data;
    setAudioEnabled(s.audioEnabled);
    setVoiceEnabled(s.voiceEnabled);
    setVoiceId(s.voiceId);
    setLowEmfMode(s.lowEmfMode);
    setWifiOffHour(s.wifiOffHour);
    setWifiOnHour(s.wifiOnHour);
  }, [settingsQuery.data]);

  function toast(msg: string) {
    setToastMsg(msg);
    setToastVisible(false);
    setTimeout(() => setToastVisible(true), 50);
    showToast(msg);
  }

  async function save(patch: Parameters<typeof updateMutation.mutateAsync>[0]) {
    try {
      await updateMutation.mutateAsync(patch);
    } catch (e) {
      Alert.alert("Error", "Failed to save setting. Please try again.");
    }
  }

  function handleAudioEnabled(v: boolean) {
    setAudioEnabled(v);
    save({ audioEnabled: v });
  }

  function handleVoiceEnabled(v: boolean) {
    setVoiceEnabled(v);
    save({ voiceEnabled: v });
  }

  function handleVoiceId(id: string) {
    setVoiceId(id);
    save({ voiceId: id });
    toast("Voice updating — sync your panel when ready.");
  }

  function handleLowEmfMode(v: boolean) {
    setLowEmfMode(v);
    save({ lowEmfMode: v });
  }

  function handleWifiOffHour(h: number) {
    setWifiOffHour(h);
    save({ wifiOffHour: h });
  }

  function handleWifiOnHour(h: number) {
    setWifiOnHour(h);
    save({ wifiOnHour: h });
  }

  const device = devicesQuery.data?.[0];
  const macSuffix = device?.macAddress
    ? "••:••:••:" + device.macAddress.slice(-8).toUpperCase()
    : "—";
  const firmware = device?.firmwareVersion ?? "—";

  if (settingsQuery.isLoading) {
    return (
      <ScreenContainer>
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <Pressable
          onPress={() => router.back()}
          style={({ pressed }) => [styles.backBtn, { opacity: pressed ? 0.6 : 1 }]}
        >
          <IconSymbol name="chevron.left" size={24} color={colors.primary} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>Panel Settings</Text>
        <View style={{ width: 40 }} />
      </View>

      <InlineToast message={toastMsg} visible={toastVisible} />

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Section 1: Audio */}
        <SectionCard
          title="Audio"
          icon="speaker.wave.2.fill"
          iconColor={colors.primary}
          colors={colors}
        >
          <ToggleRow
            label="Habit Audio"
            value={audioEnabled}
            onValueChange={handleAudioEnabled}
            colors={colors}
          />
          <Text style={[styles.sectionDesc, { color: colors.muted }]}>
            Panel plays a short audio cue for each habit when you rate it. Disable to rate habits silently.
          </Text>
          <View style={[styles.divider, { backgroundColor: colors.border }]} />
          <ToggleRow
            label="Voice Commands"
            value={voiceEnabled}
            onValueChange={handleVoiceEnabled}
            colors={colors}
          />
          <Text style={[styles.sectionDesc, { color: colors.muted }]}>
            Responds to spoken "green", "yellow", "red", "yes", "no", "done", "skip". Also enables long-press on the clock face to trigger voice commands.
          </Text>
        </SectionCard>

        {/* Section 2: Voice */}
        <SectionCard
          title="Voice"
          icon="waveform"
          iconColor="#8B5CF6"
          colors={colors}
        >
          <VoicePicker value={voiceId} onChange={handleVoiceId} colors={colors} />
          <Text style={[styles.sectionDesc, { color: colors.muted, marginTop: 10 }]}>
            When you change the voice, the panel regenerates all audio files in the background (~10–20 sec). Sync your panel when ready.
          </Text>
        </SectionCard>

        {/* Section 3: Low EMF Mode */}
        <SectionCard
          title="Low EMF Mode"
          icon="wifi"
          iconColor="#22C55E"
          colors={colors}
        >
          <ToggleRow
            label="WiFi Off While Sleeping"
            value={lowEmfMode}
            onValueChange={handleLowEmfMode}
            colors={colors}
          />
          <Text style={[styles.sectionDesc, { color: colors.muted }]}>
            Panel WiFi turns off at bedtime and back on in the morning. Voice commands and habit audio work offline. Any changes made while offline sync automatically when WiFi reconnects.
          </Text>
          {lowEmfMode && (
            <View style={{ gap: 12, marginTop: 8 }}>
              <HourPicker
                label="Turn WiFi Off At"
                value={wifiOffHour}
                onChange={handleWifiOffHour}
                colors={colors}
              />
              <HourPicker
                label="Turn WiFi On At"
                value={wifiOnHour}
                onChange={handleWifiOnHour}
                colors={colors}
              />
            </View>
          )}
        </SectionCard>

        {/* Section 4: About */}
        <SectionCard
          title="About"
          icon="info.circle"
          iconColor={colors.muted}
          colors={colors}
        >
          <View style={styles.aboutRow}>
            <Text style={[styles.aboutLabel, { color: colors.muted }]}>Firmware</Text>
            <Text style={[styles.aboutValue, { color: colors.foreground }]}>{firmware}</Text>
          </View>
          <View style={[styles.divider, { backgroundColor: colors.border }]} />
          <View style={styles.aboutRow}>
            <Text style={[styles.aboutLabel, { color: colors.muted }]}>Device ID</Text>
            <Text style={[styles.aboutValue, { color: colors.foreground }]}>{macSuffix}</Text>
          </View>
          <View style={[styles.divider, { backgroundColor: colors.border }]} />
          <View style={styles.aboutRow}>
            <Text style={[styles.aboutLabel, { color: colors.muted }]}>Sync</Text>
            <Text style={[styles.aboutValue, { color: colors.muted }]}>
              Tap More → Sync Now on your panel
            </Text>
          </View>
        </SectionCard>

        <View style={{ height: 40 }} />
      </ScrollView>
    </ScreenContainer>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 0.5,
  },
  backBtn: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: "700",
  },
  scrollContent: {
    padding: 16,
    gap: 16,
  },
  card: {
    borderRadius: 16,
    borderWidth: 1,
    overflow: "hidden",
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 16,
    paddingBottom: 12,
  },
  cardIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: "700",
  },
  cardBody: {
    paddingHorizontal: 16,
    paddingBottom: 16,
    gap: 0,
  },
  toggleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 8,
  },
  toggleLabel: {
    fontSize: 15,
    fontWeight: "500",
    flex: 1,
  },
  sectionDesc: {
    fontSize: 12,
    lineHeight: 17,
    paddingBottom: 4,
  },
  divider: {
    height: 0.5,
    marginVertical: 6,
  },
  voiceRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  voiceName: {
    fontSize: 14,
    fontWeight: "600",
  },
  voiceDesc: {
    fontSize: 12,
    marginTop: 1,
  },
  hourPickerRow: {
    gap: 6,
  },
  hourPickerLabel: {
    fontSize: 13,
    fontWeight: "500",
  },
  hourPickerScroll: {
    gap: 6,
    paddingVertical: 4,
  },
  hourChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
  },
  hourChipText: {
    fontSize: 13,
    fontWeight: "500",
  },
  aboutRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 8,
  },
  aboutLabel: {
    fontSize: 14,
  },
  aboutValue: {
    fontSize: 14,
    fontWeight: "500",
  },
  toast: {
    marginHorizontal: 16,
    marginBottom: 4,
    backgroundColor: "#1e2022",
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  toastText: {
    color: "#fff",
    fontSize: 13,
    lineHeight: 18,
  },
});
