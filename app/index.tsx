import React from 'react';
import { View, ScrollView } from 'react-native';
import { LandingNav } from '../components/landing/LandingNav';
import { Hero } from '../components/landing/Hero';
import { Proof } from '../components/landing/Proof';
import { Features, HowItWorks, UseCases } from '../components/landing/Sections';
import { CtaBand, SiteFooter } from '../components/landing/Closing';

/**
 * The marketing site, at the root.
 *
 * A stranger who hears about NoParchi lands here; the merchant app lives under
 * /app and the two customer pages - /pay/<merchantId> and /ticket/<code> - are
 * unchanged, because those are printed on QR codes and cannot move.
 *
 * Built out of the same components and tokens as the app rather than kept as a
 * separate HTML file, so the two cannot drift: change the accent in
 * src/config/theme.js and the marketing site changes with the product. It also
 * means the page inherits the theme and language controls for free.
 */
export default function LandingScreen() {
  return (
    <View className="flex-1 bg-brand-bg">
      <LandingNav />
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingBottom: 0 }}
        showsVerticalScrollIndicator={false}
      >
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
