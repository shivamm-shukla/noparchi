import React from 'react';
import { Link, Stack } from 'expo-router';
import { View, Text } from 'react-native';

export default function NotFoundScreen() {
  return (
    <>
      <Stack.Screen options={{ title: 'Page Not Found' }} />
      <View className="flex-1 items-center justify-center p-6 bg-slate-950">
        <Text className="text-2xl font-bold text-slate-100 mb-2">Screen Doesn't Exist</Text>
        <Text className="text-slate-400 text-sm mb-6 text-center">
          The screen you are looking for was moved or does not exist.
        </Text>
        <Link href="/" className="px-4 py-2 bg-emerald-500 rounded-xl">
          <Text className="text-slate-950 font-bold">Go to Dashboard</Text>
        </Link>
      </View>
    </>
  );
}
