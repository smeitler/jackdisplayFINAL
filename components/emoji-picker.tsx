import { View, Text, Pressable, FlatList, TextInput, StyleSheet, Modal, Dimensions } from 'react-native';
import { useState, useMemo } from 'react';
import { useColors } from '@/hooks/use-colors';
import { IconSymbol } from '@/components/ui/icon-symbol';

const SCREEN_HEIGHT = Dimensions.get('window').height;

// Curated emoji list grouped by theme
const EMOJI_GROUPS: { label: string; emojis: string[] }[] = [
  { label: 'Health & Body', emojis: ['💪','🏋️','🧘','🏃','🚴','🤸','🥗','🥦','💧','😴','🧠','❤️','🫀','🦷','👁️','🩺','💊','🏥','🌿','🍎'] },
  { label: 'Mind & Growth', emojis: ['📚','📖','✍️','🎯','🏆','⭐','💡','🔬','🎓','🧩','🎨','🎭','🎵','🎤','🎸','🎹','📝','🗒️','📓','🔭'] },
  { label: 'Wealth & Work', emojis: ['💰','💵','📈','💼','🏦','💳','🪙','📊','🏢','🤝','📱','💻','🖥️','⌨️','🛠️','🔧','⚙️','🚀','✈️','🌐'] },
  { label: 'Relationships', emojis: ['❤️','🧡','💛','💚','💙','💜','🤍','🖤','💕','💞','🫂','👨‍👩‍👧','👫','👬','👭','🙏','🤲','🫶','😊','😍'] },
  { label: 'Nature & Life', emojis: ['🌱','🌿','🍃','🌸','🌺','🌻','🌞','🌙','⭐','🌈','🌊','🏔️','🌲','🍀','🦋','🐝','🌍','🌅','🌄','🏡'] },
  { label: 'Food & Drink', emojis: ['🍎','🍊','🍋','🍇','🍓','🥑','🥗','🥦','🍳','☕','🍵','💧','🥤','🧃','🍰','🎂','🍫','🍕','🥩','🌮'] },
  { label: 'Activities', emojis: ['⚽','🏀','🎾','🏊','🎿','🏄','🧗','🤺','🎯','🎲','♟️','🃏','🎮','🕹️','🎳','🏹','🥊','🤼','🎭','🎪'] },
  { label: 'Symbols', emojis: ['✅','❌','⚡','🔥','💫','✨','🌟','💥','🎉','🎊','🏅','🥇','🎖️','🔑','🗝️','🔒','🛡️','⚔️','🪄','🔮'] },
];

const ALL_EMOJIS = EMOJI_GROUPS.flatMap((g) => g.emojis);

interface EmojiPickerProps {
  visible: boolean;
  onSelect: (emoji: string) => void;
  onClose: () => void;
  currentEmoji?: string;
}

export function EmojiPicker({ visible, onSelect, onClose, currentEmoji }: EmojiPickerProps) {
  const colors = useColors();
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    if (!search.trim()) return null; // show groups
    return ALL_EMOJIS.filter((e) => e.includes(search));
  }, [search]);

  function handleSelect(emoji: string) {
    onSelect(emoji);
    setSearch('');
    onClose();
  }

  const COLS = 8;
  const CELL = Math.floor((Dimensions.get('window').width - 48 - (COLS - 1) * 6) / COLS);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View style={[styles.sheet, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        {/* Handle */}
        <View style={[styles.handle, { backgroundColor: colors.border }]} />

        {/* Header */}
        <View style={styles.header}>
          <Text style={[styles.title, { color: colors.foreground }]}>Pick an Emoji</Text>
          <Pressable onPress={onClose} style={({ pressed }) => [styles.closeBtn, { opacity: pressed ? 0.5 : 1 }]}>
            <IconSymbol name="xmark.circle.fill" size={24} color={colors.muted} />
          </Pressable>
        </View>

        {/* Search */}
        <View style={[styles.searchWrap, { backgroundColor: colors.background, borderColor: colors.border }]}>
          <IconSymbol name="magnifyingglass" size={16} color={colors.muted} />
          <TextInput
            style={[styles.searchInput, { color: colors.foreground }]}
            placeholder="Search emoji…"
            placeholderTextColor={colors.muted}
            value={search}
            onChangeText={setSearch}
            autoCorrect={false}
          />
          {search.length > 0 && (
            <Pressable onPress={() => setSearch('')}>
              <IconSymbol name="xmark.circle.fill" size={16} color={colors.muted} />
            </Pressable>
          )}
        </View>

        {/* Grid */}
        <FlatList
          data={filtered ? [{ label: 'Results', emojis: filtered }] : EMOJI_GROUPS}
          keyExtractor={(_, i) => String(i)}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 32 }}
          renderItem={({ item }) => (
            <View style={styles.group}>
              {!filtered && <Text style={[styles.groupLabel, { color: colors.muted }]}>{item.label}</Text>}
              <View style={styles.emojiGrid}>
                {item.emojis.map((e) => (
                  <EmojiCell key={e} emoji={e} size={CELL} selected={e === currentEmoji} onPress={() => handleSelect(e)} colors={colors} />
                ))}
              </View>
            </View>
          )}
        />
      </View>
    </Modal>
  );
}

function EmojiCell({ emoji, size, selected, onPress, colors }: { emoji: string; size: number; selected: boolean; onPress: () => void; colors: any }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.emojiCell,
        { width: size, height: size, borderRadius: size * 0.22 },
        selected && { backgroundColor: colors.primary + '33' },
        pressed && { opacity: 0.6 },
      ]}
    >
      <Text style={{ fontSize: size * 0.55 }}>{emoji}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet: {
    maxHeight: SCREEN_HEIGHT * 0.75,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    paddingTop: 8,
  },
  handle: { width: 36, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 8 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, marginBottom: 10 },
  title: { fontSize: 17, fontWeight: '700' },
  closeBtn: { padding: 4 },
  searchWrap: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    marginHorizontal: 16, marginBottom: 12,
    paddingHorizontal: 12, paddingVertical: 8,
    borderRadius: 10, borderWidth: 1,
  },
  searchInput: { flex: 1, fontSize: 15 },
  group: { marginBottom: 16 },
  groupLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 8 },
  emojiGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  emojiRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  emojiCell: { alignItems: 'center', justifyContent: 'center' },
});
