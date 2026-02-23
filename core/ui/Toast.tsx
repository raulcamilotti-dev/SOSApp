import { StyleSheet, Text, View } from "react-native";

export function Toast({
  message,
  type,
}: {
  message: string;
  type: "success" | "error";
}) {
  if (!message) return null;

  return (
    <View
      style={[
        styles.container,
        type === "success" ? styles.success : styles.error,
      ]}
    >
      <Text style={styles.text}>{message}</Text>
    </View>
  );
}
const styles = StyleSheet.create({
  container: {
    position: "absolute",
    bottom: 40,
    left: 20,
    right: 20,
    padding: 14,
    borderRadius: 12,
    zIndex: 999,
  },
  success: {
    backgroundColor: "#16a34a",
  },
  error: {
    backgroundColor: "#dc2626",
  },
  text: {
    color: "#ffffff",
    fontWeight: "600",
    textAlign: "center",
  },
});
