/**
 * Panel Settings Screen
 * Controls audio, voice, Low EMF mode, and shows device info for the Jack Alarm display.
 * Sections: Audio, Low EMF Mode, Habits, About, Pair Panel
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
import { CameraView, useCameraPermissions, type BarcodeScanningResult } from "expo-camera";
import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import { trpc } from "@/lib/trpc";
import { useColors } from "@/hooks/use-colors";
import { ScreenContainer } from "@/components/screen-container";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useApp } from "@/lib/app-context";

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

// ─── QR Scanner Modal ─────────────────────────────────────────────────────────

function QrScannerModal({
  visible,
  onScanned,
  onClose,
  colors,
}: {
  visible: boolean;
  onScanned: (mac: string) => void;
  onClose: () => void;
  colors: ReturnType<typeof useColors>;
}) {
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);

  useEffect(() => {
    if (visible) setScanned(false);
  }, [visible]);

  if (!visible) return null;

  if (!permission) {
    return (
      <View style={styles.scannerOverlay}>
        <ActivityIndicator color="#fff" />
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={styles.scannerOverlay}>
        <View style={styles.scannerPermBox}>
          <Text style={styles.scannerPermTitle}>Camera Permission Required</Text>
          <Text style={styles.scannerPermDesc}>
            To pair your panel, allow camera access to scan the QR code displayed on the panel screen.
          </Text>
          <Pressable
            style={[styles.scannerBtn, { backgroundColor: colors.primary }]}
            onPress={requestPermission}
          >
            <Text style={styles.scannerBtnText}>Allow Camera</Text>
          </Pressable>
          <Pressable
            style={[styles.scannerBtn, { backgroundColor: "transparent", borderWidth: 1, borderColor: colors.border, marginTop: 8 }]}
            onPress={onClose}
          >
            <Text style={[styles.scannerBtnText, { color: colors.muted }]}>Cancel</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  function handleBarcode({ data }: BarcodeScanningResult) {
    if (scanned) return;
    // Payload format: "JACK:AA:BB:CC:DD:EE:FF"
    if (!data.startsWith("JACK:")) {
      Alert.alert("Invalid QR Code", "This QR code is not from a DayCheck panel. Make sure you're scanning the panel's pairing screen.");
      return;
    }
    const mac = data.slice(5); // strip "JACK:" prefix
    setScanned(true);
    if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    onScanned(mac);
  }

  return (
    <View style={styles.scannerOverlay}>
      <CameraView
        style={StyleSheet.absoluteFillObject}
        facing="back"
        barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
        onBarcodeScanned={scanned ? undefined : handleBarcode}
      />
      {/* Dim overlay with cut-out hint */}
      <View style={styles.scannerFrame} pointerEvents="none">
        <View style={[styles.scannerCorner, styles.scannerCornerTL]} />
        <View style={[styles.scannerCorner, styles.scannerCornerTR]} />
        <View style={[styles.scannerCorner, styles.scannerCornerBL]} />
        <View style={[styles.scannerCorner, styles.scannerCornerBR]} />
      </View>
      <Text style={[styles.scannerHint, Platform.OS === 'web' ? { textShadow: '0px 1px 4px rgba(0,0,0,0.8)' } as object : { textShadowColor: 'rgba(0,0,0,0.8)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 4 }]}>Point camera at the QR code on your panel</Text>
      <Pressable style={styles.scannerCloseBtn} onPress={onClose}>
        <Text style={styles.scannerCloseBtnText}>✕ Cancel</Text>
      </Pressable>
    </View>
  );
}

// ─── Main Screen ─────────────────────────────────────────────────────────────

export default function PanelSettingsScreen() {
  const colors = useColors();
  const router = useRouter();
  const { habits: appHabits } = useApp();

  const settingsQuery = trpc.devices.getSettings.useQuery();
  const devicesQuery = trpc.devices.list.useQuery();
  const updateMutation = trpc.devices.updateSettings.useMutation();
  const habitsBulkSync = trpc.habits.bulkSync.useMutation();
  const rotateKeyMutation = trpc.devices.rotateKey.useMutation();
  const claimByMacMutation = trpc.devices.claimByMac.useMutation();

  const [showScanner, setShowScanner] = useState(false);
  const [toastMsg, setToastMsg] = useState("");
  const [toastVisible, setToastVisible] = useState(false);
  const [syncingHabits, setSyncingHabits] = useState(false);

  // Local state mirrors server state
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [lowEmfMode, setLowEmfMode] = useState(false);
  const [wifiOffHour, setWifiOffHour] = useState(22);
  const [wifiOnHour, setWifiOnHour] = useState(6);

  // Sync from server on load
  useEffect(() => {
    if (!settingsQuery.data) return;
    const s = settingsQuery.data;
    setAudioEnabled(s.audioEnabled);
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
    } catch {
      Alert.alert("Error", "Failed to save setting. Please try again.");
    }
  }

  async function handleSyncHabits() {
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setSyncingHabits(true);
    try {
      const habits = appHabits;
      if (habits.length === 0) {
        toast("No habits to sync");
        setSyncingHabits(false);
        return;
      }
      await habitsBulkSync.mutateAsync(
        habits.map((h) => ({
          clientId: h.id,
          categoryClientId: h.category,
          name: h.name,
          emoji: h.emoji,
          description: h.description ?? null,
          isActive: h.isActive,
          order: h.order,
          weeklyGoal: h.weeklyGoal ?? null,
          frequencyType: (h.frequencyType as string | null) ?? null,
          monthlyGoal: h.monthlyGoal ?? null,
        }))
      );
      toast(`${habits.length} habit${habits.length !== 1 ? "s" : ""} synced to panel`);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Could not sync habits. Make sure you're logged in.";
      Alert.alert("Sync Failed", msg);
    } finally {
      setSyncingHabits(false);
    }
  }

  async function handleQrScanned(mac: string) {
    setShowScanner(false);
    try {
      await claimByMacMutation.mutateAsync({ macAddress: mac });
      await devicesQuery.refetch();
      toast("Panel paired successfully! 🎉");
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Pairing failed. Make sure the panel is online.";
      Alert.alert("Pairing Failed", msg);
    }
  }

  function handleAudioEnabled(v: boolean) {
    setAudioEnabled(v);
    save({ audioEnabled: v });
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
      {/* QR Scanner overlay (full-screen) */}
      <QrScannerModal
        visible={showScanner}
        onScanned={handleQrScanned}
        onClose={() => setShowScanner(false)}
        colors={colors}
      />

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
        </SectionCard>

        {/* Section 2: Low EMF Mode */}
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

        {/* Section 3: Habits Sync */}
        <SectionCard
          title="Habits"
          icon="checkmark.circle.fill"
          iconColor={colors.success}
          colors={colors}
        >
          <Text style={[styles.sectionDesc, { color: colors.muted, marginBottom: 10 }]}>
            Panel fetches your habits from the server when you start a recording. If the panel shows generic habits instead of yours, tap below to push your {appHabits.length} habit{appHabits.length !== 1 ? "s" : ""} to the server.
          </Text>
          <Pressable
            onPress={handleSyncHabits}
            style={({ pressed }) => [{
              backgroundColor: colors.success,
              borderRadius: 12,
              paddingVertical: 12,
              alignItems: "center" as const,
              opacity: pressed || syncingHabits ? 0.7 : 1,
            }]}
          >
            {syncingHabits ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={{ color: "#fff", fontWeight: "700", fontSize: 15 }}>
                Sync Habits to Panel
              </Text>
            )}
          </Pressable>
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
          {device && (
            <>
              <View style={[styles.divider, { backgroundColor: colors.border }]} />
              <View style={styles.aboutRow}>
                <Text style={[styles.aboutLabel, { color: colors.muted }]}>API Key</Text>
                <Pressable
                  onPress={() => {
                    Alert.alert(
                      "Rotate API Key",
                      "This generates a new key and invalidates the old one. The panel will stop syncing until you re-pair it. Continue?",
                      [
                        { text: "Cancel", style: "cancel" },
                        {
                          text: "Rotate Key",
                          style: "destructive",
                          onPress: () => {
                            if (!device?.id) return;
                            rotateKeyMutation.mutate(
                              { deviceId: device.id },
                              {
                                onSuccess: () => {
                                  devicesQuery.refetch();
                                  toast("Key rotated — re-pair your panel to reconnect");
                                },
                                onError: (err) => Alert.alert("Error", err.message),
                              }
                            );
                          },
                        },
                      ]
                    );
                  }}
                  style={({ pressed }) => [{ opacity: pressed ? 0.6 : 1 }]}
                >
                  {rotateKeyMutation.isPending ? (
                    <ActivityIndicator size="small" color={colors.error} />
                  ) : (
                    <Text style={[styles.aboutValue, { color: colors.error, fontWeight: "600" }]}>
                      Rotate Key…
                    </Text>
                  )}
                </Pressable>
              </View>
            </>
          )}
        </SectionCard>

        {/* Section 5: Pair Panel — always visible so user can re-pair */}
        <SectionCard
          title={device ? "Re-pair Panel" : "Pair Your Panel"}
          icon="link"
          iconColor={colors.primary}
          colors={colors}
        >
          {device ? (
            <Text style={[styles.sectionDesc, { color: colors.muted, marginBottom: 12 }]}>
              Your panel is already linked. To link a different panel, scan its QR code below.
            </Text>
          ) : (
            <Text style={[styles.sectionDesc, { color: colors.muted, marginBottom: 12 }]}>
              On your panel, go to Settings → Pair with Jack App. A QR code will appear — scan it here to link the panel to your account.
            </Text>
          )}
          <Pressable
            onPress={() => {
              if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              setShowScanner(true);
            }}
            style={({ pressed }) => [
              styles.claimBtn,
              { backgroundColor: colors.primary, opacity: pressed ? 0.7 : 1 },
            ]}
          >
            {claimByMacMutation.isPending ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={styles.claimBtnText}>
                {device ? "Scan Panel QR to Re-pair" : "Scan Panel QR Code"}
              </Text>
            )}
          </Pressable>
          {claimByMacMutation.isError && (
            <Text style={[styles.sectionDesc, { color: colors.error, marginTop: 8 }]}>
              {claimByMacMutation.error?.message ?? "Pairing failed. Try again."}
            </Text>
          )}
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
  claimBtn: {
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: "center",
    marginTop: 4,
  },
  claimBtnText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 15,
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
  // ── QR Scanner styles ──
  scannerOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 999,
    backgroundColor: "#000",
    alignItems: "center",
    justifyContent: "center",
  },
  scannerFrame: {
    position: "absolute",
    width: 240,
    height: 240,
    alignSelf: "center",
    top: "50%",
    marginTop: -120,
  },
  scannerCorner: {
    position: "absolute",
    width: 32,
    height: 32,
    borderColor: "#fff",
    borderWidth: 3,
  },
  scannerCornerTL: {
    top: 0,
    left: 0,
    borderRightWidth: 0,
    borderBottomWidth: 0,
    borderTopLeftRadius: 6,
  },
  scannerCornerTR: {
    top: 0,
    right: 0,
    borderLeftWidth: 0,
    borderBottomWidth: 0,
    borderTopRightRadius: 6,
  },
  scannerCornerBL: {
    bottom: 0,
    left: 0,
    borderRightWidth: 0,
    borderTopWidth: 0,
    borderBottomLeftRadius: 6,
  },
  scannerCornerBR: {
    bottom: 0,
    right: 0,
    borderLeftWidth: 0,
    borderTopWidth: 0,
    borderBottomRightRadius: 6,
  },
  scannerHint: {
    position: "absolute",
    bottom: 160,
    color: "#fff",
    fontSize: 15,
    fontWeight: "600",
    textAlign: "center",
    paddingHorizontal: 32,
    // textShadow applied inline (platform-specific, see usage)
  },
  scannerCloseBtn: {
    position: "absolute",
    bottom: 80,
    backgroundColor: "rgba(255,255,255,0.15)",
    paddingHorizontal: 32,
    paddingVertical: 14,
    borderRadius: 30,
  },
  scannerCloseBtnText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "700",
  },
  scannerPermBox: {
    backgroundColor: "#1e2022",
    borderRadius: 20,
    padding: 24,
    margin: 24,
    alignItems: "center",
    gap: 12,
  },
  scannerPermTitle: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "700",
    textAlign: "center",
  },
  scannerPermDesc: {
    color: "#9BA1A6",
    fontSize: 14,
    lineHeight: 20,
    textAlign: "center",
  },
  scannerBtn: {
    width: "100%",
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
  },
  scannerBtnText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "700",
  },
});
