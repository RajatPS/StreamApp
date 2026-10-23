import { StyleSheet, Text, View } from 'react-native';

export default function HeaderComponent() {
  return (
    <View style={styles.header}>
      <Text style={styles.text}>hello world</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  header: {
    backgroundColor: 'black',
    height: 100,
    width: '100%',
  },
  text:{
    fontSize: 20,
    color: 'white',
    textAlign: 'center',
  }
});