/**
 * Restricts which CPU architectures the Android build compiles native code for.
 *
 * This exists because the obvious way to do it does not work. `eas.json` used
 * to carry `env: { REACT_NATIVE_ARCHITECTURES: "arm64-v8a" }`, which reads like
 * it should limit the build and does nothing at all: `android/app/build.gradle`
 * resolves the ABI list from the *Gradle property* `reactNativeArchitectures`,
 * never from the process environment. So every build kept the default
 * `armeabi-v7a,arm64-v8a,x86,x86_64` and shipped four copies of every .so.
 *
 * The cost was not marginal. The APK that shipped carried 88 MB of native
 * libraries, of which 49 MB were the two x86 slices - emulator-only code that
 * no phone on earth will ever load. Total download: 106 MB, for an app whose
 * entire premise is working on a cheap handset in a basement with one bar of
 * signal.
 *
 * `NOPARCHI_ANDROID_ABIS` chooses the list, defaulting to arm64-v8a alone.
 * That default is right for the APK people download from the site: every
 * Android phone sold in India since roughly 2019 is arm64. App bundles are a
 * different case - Play and Indus split an AAB per device themselves, so
 * restricting one buys no download saving and only drops older 32-bit handsets.
 * eas.json therefore widens the list back out for the two app-bundle profiles.
 */
const { withGradleProperties } = require('expo/config-plugins');

const DEFAULT_ABIS = 'arm64-v8a';

const withAndroidAbis = (config) => {
  const abis = (process.env.NOPARCHI_ANDROID_ABIS || DEFAULT_ABIS).trim();

  return withGradleProperties(config, (cfg) => {
    // Replace rather than append: prebuild writes its own default first, and a
    // duplicate key would leave which one wins up to Gradle's parse order.
    cfg.modResults = cfg.modResults.filter(
      (item) => !(item.type === 'property' && item.key === 'reactNativeArchitectures')
    );
    cfg.modResults.push({
      type: 'property',
      key: 'reactNativeArchitectures',
      value: abis,
    });
    return cfg;
  });
};

module.exports = withAndroidAbis;
