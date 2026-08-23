import React from 'react';
import { Link, Stack } from 'expo-router';
import { View, Text } from 'react-native';
import { useTranslation } from 'react-i18next';

export default function NotFoundScreen() {
  const { t } = useTranslation();
  return (
    <>
      <Stack.Screen options={{ title: t('notFound.pageTitle') }} />
      <View className="flex-1 items-center justify-center p-6 bg-brand-bg">
        <Text className="text-2xl font-bold text-brand-text mb-2">{t('notFound.title')}</Text>
        <Text className="text-brand-text-muted text-sm mb-6 text-center">
          {t('notFound.body')}
        </Text>
        <Link href="/" className="px-4 py-2 bg-brand-accent rounded-xl">
          <Text className="text-brand-on-accent font-bold">{t('notFound.home')}</Text>
        </Link>
      </View>
    </>
  );
}
