import React from 'react';
import { View, ScrollView, Platform } from 'react-native';
import { Redirect } from 'expo-router';
import { LandingNav } from '../components/landing/LandingNav';
import { MobileAppBanner } from '../components/landing/MobileAppBanner';
import { Hero } from '../components/landing/Hero';
import { Proof } from '../components/landing/Proof';
import { Features, HowItWorks, UseCases } from '../components/landing/Sections';
import { CtaBand, SiteFooter } from '../components/landing/Closing';

/**
 * The marketing site, at the root on web.
 *
 * On native mobile (Android APK / iOS), users opening the app should directly
 * enter the merchant / gatekeeper app flow (/app) rather than seeing the
 * marketing website.
 */
export default function LandingScreen() {
  if (Platform.OS !== 'web') {
    return <Redirect href="/app" />;
  }

  return (
    <View className="flex-1 bg-brand-bg">
      <LandingNav />
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingBottom: 0 }}
        showsVerticalScrollIndicator={false}
      >
        <MobileAppBanner />
        <Hero />
        <Features />
        <HowItWorks />
        <Proof />
        <UseCases />
        <CtaBand />
        <SiteFooter />
      </ScrollView>
    </View>
  );
}
