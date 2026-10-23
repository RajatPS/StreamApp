import { Pressable, StyleSheet, Text, View } from 'react-native';

export default function Navbar({ onMenuPress }: { onMenuPress: () => void }) {
  return (
    <View style={styles.navbar}>
      <Pressable
        style={styles.menuButton}
        onPress={onMenuPress}
      >
        <Text style={styles.menuText}>☰</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  navbar: {
    height: 60,
    backgroundColor: '#1a1a1a',
    justifyContent: 'center',
    paddingHorizontal: 15,
  },
  menuButton: {
    alignSelf: 'flex-start',
  },
  menuText: {
    color: '#fff',
    fontSize: 28,
    lineHeight: 28,
  },
});