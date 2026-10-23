import { Stack } from 'expo-router';

export default function RootLayout() {
  return (
    <Stack>
      <Stack.Screen
        name="camera-preview"
        options={{ headerShown: false }}
      />
    </Stack>
  );
}