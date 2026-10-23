import { StyleSheet, View } from 'react-native';

export default function Sidebar() {
  return (
    <View style={styles.sidebar}>
    </View>
  );
}

const styles = StyleSheet.create({
  sidebar: {
    position: 'absolute',
    left: 0,
    top: 60,
    width: 280,
    height: '100%',
    backgroundColor: '#1c1c1c',
    zIndex: 10,
  },
});