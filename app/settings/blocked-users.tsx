import { useEffect, useState } from "react";
import {
  View,
  Text,
  FlatList,
  ActivityIndicator,
  Pressable,
  Alert,
} from "react-native";
import { useRouter } from "expo-router";
import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import { trpc } from "@/lib/trpc";

interface BlockedUser {
  id: number;
  username: string;
  avatarUrl: string | null;
}

export default function BlockedUsersScreen() {
  const colors = useColors();
  const router = useRouter();
  const [blockedUsers, setBlockedUsers] = useState<BlockedUser[]>([]);
  const [loading, setLoading] = useState(true);

  const unblockMutation = trpc.moderation.unblockUser.useMutation({
    onSuccess: () => {
      // Refresh the list
      fetchBlockedUsers();
    },
    onError: (error) => {
      Alert.alert("Error", error.message || "Failed to unblock user");
    },
  });

  const fetchBlockedUsers = async () => {
    try {
      setLoading(true);
      const response = await fetch(
        `${process.env.EXPO_PUBLIC_API_URL}/api/trpc/moderation.blockedIds`,
        {
          method: "GET",
          credentials: "include",
          headers: {
            "Content-Type": "application/json",
          },
        }
      );

      if (!response.ok) {
        throw new Error("Failed to fetch blocked users");
      }

      const data = await response.json();
      // The API returns { result: { data: [ids] } }
      const blockedIds = data.result?.data || [];

      // For now, we'll show the IDs. In a production app, you'd fetch user details
      setBlockedUsers(
        blockedIds.map((id: number) => ({
          id,
          username: `User ${id}`,
          avatarUrl: null,
        }))
      );
    } catch (error) {
      console.error("Error fetching blocked users:", error);
      Alert.alert("Error", "Failed to load blocked users");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBlockedUsers();
  }, []);

  const handleUnblock = (userId: number, username: string) => {
    Alert.alert(
      "Unblock User",
      `Are you sure you want to unblock ${username}?`,
      [
        { text: "Cancel", onPress: () => {}, style: "cancel" },
        {
          text: "Unblock",
          onPress: () => {
            unblockMutation.mutate({ userId });
          },
          style: "destructive",
        },
      ]
    );
  };

  if (loading) {
    return (
      <ScreenContainer className="flex items-center justify-center">
        <ActivityIndicator size="large" color={colors.primary} />
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer className="flex-1">
      <View className="flex-1">
        {/* Header */}
        <View className="px-4 py-4 border-b border-border">
          <Pressable onPress={() => router.back()}>
            <Text className="text-lg font-semibold text-primary">← Back</Text>
          </Pressable>
          <Text className="text-2xl font-bold text-foreground mt-2">
            Blocked Users
          </Text>
          <Text className="text-sm text-muted mt-1">
            Manage people you've blocked
          </Text>
        </View>

        {/* List */}
        {blockedUsers.length === 0 ? (
          <View className="flex-1 items-center justify-center px-4">
            <Text className="text-lg text-muted text-center">
              You haven't blocked anyone yet
            </Text>
          </View>
        ) : (
          <FlatList
            data={blockedUsers}
            keyExtractor={(item) => item.id.toString()}
            renderItem={({ item }) => (
              <View className="px-4 py-3 border-b border-border flex-row items-center justify-between">
                <View className="flex-1">
                  <Text className="text-base font-medium text-foreground">
                    {item.username}
                  </Text>
                </View>
                <Pressable
                  onPress={() => handleUnblock(item.id, item.username)}
                  style={({ pressed }) => [
                    {
                      opacity: pressed ? 0.6 : 1,
                    },
                  ]}
                >
                  <Text className="text-sm font-semibold text-error">
                    Unblock
                  </Text>
                </Pressable>
              </View>
            )}
            scrollEnabled={true}
            contentContainerStyle={{ flexGrow: 1 }}
          />
        )}
      </View>
    </ScreenContainer>
  );
}
