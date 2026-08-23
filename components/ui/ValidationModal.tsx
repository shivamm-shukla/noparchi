import React, { useEffect, useRef, useState } from 'react';
import { View, Modal, Pressable, ScrollView } from 'react-native';
import {
  Check,
  Ban,
  AlertTriangle,
  ShieldAlert,
  WifiOff,
  Clock,
  X,
  MapPin,
  User,
} from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { useThemeColors } from '../../src/context/ThemeContext';
import { Button } from './Button';
import { Text } from './Text';
import { formatCurrency, formatDateTime, formatTime } from '../../src/utils/formatters';
import type { ScanResult, ScanStatus } from '../../src/types';

/** A clean pass closes itself, so a queue keeps moving without a tap. */
const AUTO_CLOSE_SECONDS = 4;

interface ValidationModalProps {
  result: ScanResult | null;
  visible: boolean;
  onClose: () => void;
  /**
   * Collect the overstay and open the gate. Only shown for EXPIRED, and only
   * when the caller can act on it - the scanner passes it, a read-only view
   * would not.
   */
  onCollectOverstay?: (amount: number) => Promise<void>;
}

interface Presentation {
  headlineKey: string;
  /** Full-bleed wash behind the whole sheet. */
  wash: string;
  text: string;
  chip: string;
  color: string;
  Icon: typeof Check;
}

/**
 * Built per render rather than held as a module constant, because the icon
 * colours are raw props that have to follow the active theme - a constant would
 * freeze whichever theme happened to load first.
 *
 * Every state has a distinct glyph as well as a distinct colour. Red and green
 * are the two hues most commonly confused, and this is the one screen in the
 * product where getting the answer wrong lets a car out for free.
 */
const presentationFor = (colors: Record<string, string>): Record<ScanStatus, Presentation> => ({
  VERIFIED: {
    headlineKey: 'scanner.result.verified',
    wash: 'bg-brand-accent/10',
    text: 'text-brand-accent',
    chip: 'bg-brand-accent',
    color: colors['on-accent'],
    Icon: Check,
  },
  ALREADY_USED: {
    headlineKey: 'scanner.result.alreadyUsed',
    wash: 'bg-brand-danger/10',
    text: 'text-brand-danger',
    chip: 'bg-brand-danger',
    color: colors['on-danger'],
    Icon: Ban,
  },
  UNPAID: {
    headlineKey: 'scanner.result.notPaid',
    wash: 'bg-brand-warning/10',
    text: 'text-brand-warning',
    chip: 'bg-brand-warning',
    color: colors['on-accent'],
    Icon: AlertTriangle,
  },
  EXPIRED: {
    headlineKey: 'scanner.result.timeOver',
    wash: 'bg-brand-warning/10',
    text: 'text-brand-warning',
    chip: 'bg-brand-warning',
    color: colors['on-accent'],
    Icon: Clock,
  },
  INVALID: {
    headlineKey: 'scanner.result.invalid',
    wash: 'bg-brand-danger/10',
    text: 'text-brand-danger',
    chip: 'bg-brand-danger',
    color: colors['on-danger'],
    Icon: X,
  },
  UNAUTHORIZED: {
    headlineKey: 'scanner.result.notAllowed',
    wash: 'bg-brand-surface-alt',
    text: 'text-brand-text-subtle',
    chip: 'bg-brand-neutral',
    color: colors['on-danger'],
    Icon: ShieldAlert,
  },
});

/**
 * The gatekeeper's answer, in one glance.
 *
 * Read in a second, in daylight, by someone with a queue behind them - so the
 * outcome fills the screen and is carried by a glyph and one large word before
 * any detail. UNPAID is its own state rather than folded into INVALID: "a real
 * pass nobody paid for" usually means the customer is standing right there and
 * can pay, which is a different action from turning away a fake.
 */
export const ValidationModal: React.FC<ValidationModalProps> = ({
  result,
  visible,
  onClose,
  onCollectOverstay,
}) => {
  const colors = useThemeColors();
  const { t } = useTranslation();
  const [collecting, setCollecting] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  const status = result?.status;
  const isClean = status === 'VERIFIED';

  /*
    A verified pass dismisses itself. Every refusal waits: it needs the
    gatekeeper to have actually read it, and something has to happen next -
    money taken, a customer turned away - that a timer must not pre-empt.
  */
  useEffect(() => {
    if (!visible || !isClean) {
      setCountdown(null);
      return;
    }
    setCountdown(AUTO_CLOSE_SECONDS);
    const tick = setInterval(() => {
      setCountdown((current) => {
        if (current === null) return null;
        if (current <= 1) {
          clearInterval(tick);
          closeRef.current();
          return null;
        }
        return current - 1;
      });
    }, 1000);
    return () => clearInterval(tick);
  }, [visible, isClean]);

  if (!result) return null;

  const p = presentationFor(colors)[result.status] ?? presentationFor(colors).INVALID;
  const ticket = result.ticket;
  const overstayDue = result.overstayDue ?? 0;

  // Offline, the server cannot be asked what is owed, so there is nothing to
  // collect against and the button would be a guess.
  const canCollect =
    result.status === 'EXPIRED' && Boolean(onCollectOverstay) && !result.queuedOffline;

  const collect = async () => {
    if (!onCollectOverstay) return;
    setCollecting(true);
    try {
      await onCollectOverstay(overstayDue);
    } finally {
      setCollecting(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      {/* Tap anywhere to move on - a gatekeeper should never hunt for a close button. */}
      <Pressable
        onPress={onClose}
        accessibilityRole="button"
        accessibilityLabel={t('scanner.result.dismiss')}
        className={`flex-1 items-center justify-center p-4 ${p.wash}`}
      >
        <View className="absolute inset-0 bg-brand-scrim" pointerEvents="none" />

        <Pressable
          onPress={(event) => event.stopPropagation()}
          // Capped so the sheet can never grow past the screen on a phone. The
          // detail list in the middle absorbs the difference, which keeps the
          // headline and - more importantly - the two actions on screen. A
          // gatekeeper who cannot reach "open gate" has to let the car through
          // on trust, which is the thing this product exists to stop.
          style={{ maxHeight: '94%' }}
          className="w-full max-w-md overflow-hidden rounded-panel border border-brand-border bg-brand-surface"
        >
          <View className={`items-center px-6 pb-5 pt-7 ${p.wash}`}>
            <View
              className={`mb-4 h-20 w-20 items-center justify-center rounded-full ${p.chip}`}
            >
              <p.Icon size={44} color={p.color} strokeWidth={3} />
            </View>

            <Text
              font="display-extrabold"
              className={`text-center text-[32px] leading-tight ${p.text}`}
            >
              {t(p.headlineKey)}
            </Text>

            <Text
              font="body"
              className="mt-3 text-center text-sm leading-6 text-brand-text-subtle"
            >
              {result.message}
            </Text>

            {result.queuedOffline && (
              <View className="mt-4 flex-row items-center gap-2 rounded-full border border-brand-border bg-brand-surface px-3 py-1.5">
                <WifiOff size={12} color={colors['text-muted']} />
                <Text font="body-medium" className="text-[11px] text-brand-text-subtle">
                  {t('scanner.result.offlineNote')}
                </Text>
              </View>
            )}
          </View>

          <ScrollView
            style={{ flexShrink: 1 }}
            contentContainerStyle={{ padding: 20, gap: 14 }}
          >
            {/*
              Who cleared it, where, and when. The server sends these as fields
              rather than only inside the message, because a gatekeeper facing
              an argument needs them as facts they can point at.
            */}
            {result.status === 'ALREADY_USED' && result.validation && (
              <View className="gap-2.5 rounded-card border border-brand-danger/30 bg-brand-danger/5 p-4">
                <Text font="body-semibold" className="text-[13px] text-brand-danger">
                  {t('scanner.result.firstUsedTitle')}
                </Text>
                <Fact
                  icon={<Clock size={13} color={colors['text-muted']} />}
                  value={t('scanner.result.firstUsedWhen', {
                    time: formatTime(result.validation.scannedAt),
                  })}
                />
                <Fact
                  icon={<User size={13} color={colors['text-muted']} />}
                  value={t('scanner.result.firstUsedWho', {
                    name:
                      result.validation.scannedByName ?? t('scanner.result.unknownGatekeeper'),
                  })}
                />
                <Fact
                  icon={<MapPin size={13} color={colors['text-muted']} />}
                  value={t('scanner.result.firstUsedWhere', {
                    gate: result.validation.exitGate,
                  })}
                />
              </View>
            )}

            {result.status === 'EXPIRED' && overstayDue > 0 && (
              <View className="items-center rounded-card border border-brand-warning/40 bg-brand-warning/10 p-4">
                <Text
                  font="body-bold"
                  className="text-[11px] uppercase tracking-wider text-brand-warning"
                >
                  {t('scanner.result.collectBeforeExit')}
                </Text>
                <Text
                  font="display-extrabold"
                  className="mt-1 text-[34px] leading-tight text-brand-warning"
                >
                  {formatCurrency(overstayDue)}
                </Text>
              </View>
            )}

            {ticket && (
              <View className="gap-2.5 rounded-card border border-brand-border bg-brand-surface-alt p-4">
                <Row label={t('scanner.result.passCode')} value={ticket.ticketCode} />
                <Row label={t('scanner.result.type')} value={ticket.ticketTypeLabel} />
                {ticket.vehicleNumber ? (
                  <Row label={t('scanner.result.vehicle')} value={ticket.vehicleNumber} />
                ) : null}
                <Row label={t('scanner.result.amount')} value={formatCurrency(ticket.amount)} />
                <Row label={t('scanner.result.issued')} value={formatDateTime(ticket.createdAt)} />
              </View>
            )}
          </ScrollView>

          <View className="gap-2 border-t border-brand-border p-5">
            {canCollect && (
              <Button
                title={
                  overstayDue > 0
                    ? t('scanner.result.collectedOpenGate', {
                        amount: formatCurrency(overstayDue),
                      })
                    : t('scanner.result.openGate')
                }
                variant="primary"
                size="lg"
                fullWidth
                loading={collecting}
                onPress={collect}
              />
            )}
            <Button
              title={
                countdown !== null
                  ? t('scanner.result.autoClosing', { seconds: countdown })
                  : t('scanner.result.scanNext')
              }
              variant={isClean ? 'primary' : 'secondary'}
              size="lg"
              fullWidth
              accessibilityLabel={t('scanner.result.scanNext')}
              onPress={onClose}
            />
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
};

const Fact: React.FC<{ icon: React.ReactNode; value: string }> = ({ icon, value }) => (
  <View className="flex-row items-center gap-2">
    {icon}
    <Text font="body-medium" className="flex-1 text-[13px] text-brand-text-subtle">
      {value}
    </Text>
  </View>
);

const Row: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <View className="flex-row items-center justify-between gap-3">
    <Text font="body" className="text-xs text-brand-text-muted">
      {label}
    </Text>
    <Text font="body-semibold" numberOfLines={1} className="text-sm text-brand-text">
      {value}
    </Text>
  </View>
);
