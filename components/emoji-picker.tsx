/**
 * EmojiPicker — Modal with emoji grid + photo upload for reward icons.
 * Used in HabitModal to let users pick a custom reward icon.
 *
 * Props:
 *   visible       — whether the modal is open
 *   selectedEmoji — currently selected emoji (shown with highlight)
 *   onSelectEmoji — called with the chosen emoji string
 *   onSelectImage — called with a base64 data URI when a photo is picked
 *   onClose       — called when the modal is dismissed
 */
import {
  Modal, View, Text, Pressable, ScrollView, StyleSheet, Platform, Image,
  TouchableOpacity,
} from 'react-native';
import { useState } from 'react';
import { useColors } from '@/hooks/use-colors';
import * as ImagePicker from 'expo-image-picker';

// ─── Emoji categories ─────────────────────────────────────────────────────────
const CATEGORIES: { label: string; emojis: string[] }[] = [
  {
    label: 'Rewards',
    emojis: ['🎁','🏆','🥇','🎉','🎊','🎖️','🏅','🎀','🎗️','🎫','🎟️','🥂','🍾','🎈','🎆'],
  },
  {
    label: 'Food & Drink',
    emojis: ['🍕','🍔','🍣','🍜','🍦','🧁','🍰','🎂','🍩','🍪','🍫','🥗','🍱','🍛','🥩'],
  },
  {
    label: 'Travel',
    emojis: ['✈️','🌴','🏖️','🗺️','🌍','🏔️','🚀','🛳️','🏕️','🌅','🗼','🏰','🎡','🎢','🌋'],
  },
  {
    label: 'Lifestyle',
    emojis: ['👟','💆','🛍️','🎮','📚','🎵','🎬','💪','🧘','🛁','🏊','🎸','🎨','🖼️','🪴'],
  },
  {
    label: 'Nature',
    emojis: ['🌸','🌺','🌻','🌹','🌿','🍀','🌊','🌈','⭐','🌙','☀️','🦋','🐬','🦁','🌲'],
  },
  {
    label: 'Objects',
    emojis: ['💎','💍','👑','🔑','🪄','🎯','🧩','🎲','🎻','🎹','📷','🖥️','⌚','🧳','🪞'],
  },
];

interface EmojiPickerProps {
  visible: boolean;
  selectedEmoji?: string;
  onSelectEmoji: (emoji: string) => void;
  onSelectImage: (uri: string) => void;
  onClose: () => void;
}

export function EmojiPicker({
  visible, selectedEmoji, onSelectEmoji, onSelectImage, onClose,
}: EmojiPickerProps) {
  const colors = useColors();
  const [activeCategory, setActiveCategory] = useState(0);

  async function handlePickPhoto() {
    try {
      if (Platform.OS !== 'web') {
        const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (status !== 'granted') return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.7,
        base64: true,
      });
      if (!result.canceled && result.assets[0]) {
        const asset = result.assets[0];
        if (asset.base64) {
          const mimeType = asset.mimeType ?? 'image/jpeg';
          onSelectImage(`data:${mimeType};base64,${asset.base64}`);
          onClose();
        } else if (asset.uri) {
          onSelectImage(asset.uri);
          onClose();
        }
      }
    } catch (e) {
      console.warn('[EmojiPicker] Photo pick error:', e);
    }
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable
          style={[styles.sheet, { backgroundColor: colors.surface, borderColor: colors.border }]}
          onPress={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <View style={[styles.header, { borderBottomColor: colors.border }]}>
            <Text style={[styles.title, { color: colors.foreground }]}>Choose reward icon</Text>
            <Pressable onPress={onClose} style={styles.closeBtn}>
              <Text style={[styles.closeBtnText, { color: colors.muted }]}>✕</Text>
            </Pressable>
          </View>

          {/* Photo upload button */}
          <TouchableOpacity
            onPress={handlePickPhoto}
            style={[styles.photoBtn, { backgroundColor: colors.primary + '15', borderColor: colors.primary + '40' }]}
            activeOpacity={0.75}
          >
            <Text style={[styles.photoBtnIcon, { color: colors.primary }]}>📷</Text>
            <Text style={[styles.photoBtnText, { color: colors.primary }]}>Use a photo from your library</Text>
          </TouchableOpacity>

          {/* Category tabs */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.catScroll}
            contentContainerStyle={styles.catScrollContent}
          >
            {CATEGORIES.map((cat, i) => (
              <TouchableOpacity
                key={cat.label}
                onPress={() => setActiveCategory(i)}
                style={[
                  styles.catTab,
                  {
                    backgroundColor: activeCategory === i ? colors.primary : 'transparent',
                    borderColor: activeCategory === i ? colors.primary : colors.border,
                  },
                ]}
                activeOpacity={0.7}
              >
                <Text style={[styles.catTabText, { color: activeCategory === i ? '#fff' : colors.muted }]}>
                  {cat.label}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          {/* Emoji grid */}
          <ScrollView style={styles.gridScroll} showsVerticalScrollIndicator={false}>
            <View style={styles.grid}>
              {CATEGORIES[activeCategory].emojis.map((emoji) => (
                <TouchableOpacity
                  key={emoji}
                  onPress={() => { onSelectEmoji(emoji); onClose(); }}
                  style={[
                    styles.emojiCell,
                    {
                      backgroundColor: emoji === selectedEmoji ? colors.primary + '25' : 'transparent',
                      borderColor: emoji === selectedEmoji ? colors.primary : 'transparent',
                    },
                  ]}
                  activeOpacity={0.65}
                >
                  <Text style={styles.emojiText}>{emoji}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'flex-end',
  },
  sheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderWidth: 1,
    borderBottomWidth: 0,
    maxHeight: '75%',
    paddingBottom: 24,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderBottomWidth: 0.5,
  },
  title: { fontSize: 16, fontWeight: '700' },
  closeBtn: { padding: 4 },
  closeBtnText: { fontSize: 16, fontWeight: '600' },
  photoBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 4,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 11,
  },
  photoBtnIcon: { fontSize: 20 },
  photoBtnText: { fontSize: 14, fontWeight: '600' },
  catScroll: { flexGrow: 0, marginTop: 10 },
  catScrollContent: { paddingHorizontal: 14, gap: 8 },
  catTab: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
  },
  catTabText: { fontSize: 12, fontWeight: '600' },
  gridScroll: { marginTop: 10, paddingHorizontal: 8 },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 8,
    paddingBottom: 8,
  },
  emojiCell: {
    width: '14.28%', // 7 columns
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
    borderWidth: 1.5,
  },
  emojiText: { fontSize: 26 },
});
