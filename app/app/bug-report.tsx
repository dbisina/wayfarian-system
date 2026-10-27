// app/app/bug-report.tsx — send the developers a bug report. It goes to Sentry (with the recent app
// activity attached) and falls back to an email draft when Sentry is not available.

import React, { useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Linking, Platform, ScrollView, StyleSheet, Switch, Text, TouchableOpacity, View } from 'react-native';
import TextInput from '../components/dw/DWTextInput';
import * as Sentry from '@sentry/react-native';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { router } from 'expo-router';
import ScreenHeader from '../components/ScreenHeader';
import { useAuth } from '../contexts/AuthContext';
import { AMBER, F, INK, useDW } from '../constants/design';
import { DEVELOPER_EMAIL, MAX_REPORT_CHARS, deviceLines, reportBody, reportMailto, reportProblem, type BugReport } from '../v2/bugReport';

export default function BugReportScreen() {
  const d = useDW();
  const { user } = useAuth();
  const [message, setMessage] = useState('');
  const [email, setEmail] = useState(user?.email ?? '');
  const [includeDevice, setIncludeDevice] = useState(true);
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState(false);

  const device = {
    appVersion: Constants.expoConfig?.version ?? null,
    model: Device.modelName ?? null,
    os: Device.osName ?? Platform.OS,
    osVersion: Device.osVersion ?? null,
  };
  const report: BugReport = { message, email, includeDevice, device };
  const problem = message.length > 0 ? reportProblem(message, email) : null;

  const emailInstead = async () => {
    try {
      await Linking.openURL(reportMailto(report));
    } catch {
      Alert.alert('No mail app found', `Email your report to ${DEVELOPER_EMAIL}.`);
    }
  };

  const send = async () => {
    const bad = reportProblem(message, email);
    if (bad) { Alert.alert('One more thing', bad); return; }
    // No Sentry (a build without its key): say so and offer an email, rather than pretend it was sent.
    if (!Sentry.getClient()) {
      Alert.alert('Reports can’t be sent from this build', 'Email it to the developers instead?', [
        { text: 'Email', onPress: emailInstead },
        { text: 'Cancel', style: 'cancel' },
      ]);
      return;
    }
    setSending(true);
    try {
      let eventId: string | undefined;
      // The report event carries the app's recent activity (breadcrumbs); the feedback links to it.
      Sentry.withScope((scope) => {
        scope.setTag('bug_report', 'true');
        if (user?.id) scope.setUser({ id: user.id, email: email.trim() || undefined });
        if (includeDevice) scope.setContext('device_info', { ...device });
        eventId = Sentry.captureMessage('Bug report', 'info');
      });
      Sentry.captureFeedback({
        message: reportBody(report),
        name: user?.displayName || undefined,
        email: email.trim() || undefined,
        associatedEventId: eventId,
      });
      // Wait (up to 5 s) for the report to leave the phone, so "Thank you" is only shown once it has.
      const flushed = await Sentry.getClient()?.flush(5000);
      if (!flushed) throw new Error('not delivered');
      setDone(true);
    } catch {
      Alert.alert('Could not send it', 'Check your connection and try again, or email it to the developers.', [
        { text: 'Email', onPress: emailInstead },
        { text: 'OK', style: 'cancel' },
      ]);
    } finally {
      setSending(false);
    }
  };

  if (done) {
    return (
      <View style={[styles.root, { backgroundColor: d.bg }]}>
        <ScreenHeader title="Report a bug" />
        <View style={styles.thanks}>
          <Text style={[styles.thanksTitle, { color: d.ink }]}>Thank you</Text>
          <Text style={[styles.thanksSub, { color: d.ink2 }]}>Your report reached the developers. If it needs a reply, they will use the email you gave.</Text>
          <TouchableOpacity onPress={() => router.back()} accessibilityRole="button" style={[styles.send, { backgroundColor: AMBER }]}>
            <Text style={[styles.sendText, { color: INK }]}>Done</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={[styles.root, { backgroundColor: d.bg }]} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScreenHeader title="Report a bug" />
      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <Text style={[styles.lead, { color: d.ink2 }]}>What went wrong? What did you do, and what did you expect?</Text>
        <TextInput
          value={message}
          onChangeText={(t) => setMessage(t.slice(0, MAX_REPORT_CHARS))}
          placeholder="For example: the map stayed zoomed out when I started a ride"
          placeholderTextColor={d.ink2}
          multiline
          accessibilityLabel="Describe the bug"
          style={[styles.box, { backgroundColor: d.surface, color: d.ink }]}
        />
        <Text style={[styles.count, { color: d.ink2 }]}>{message.length}/{MAX_REPORT_CHARS}</Text>
        {problem ? <Text style={[styles.problem, { color: d.danger }]} accessibilityLiveRegion="polite">{problem}</Text> : null}

        <Text style={[styles.fieldLabel, { color: d.ink2 }]}>Your email (so we can reply)</Text>
        <TextInput
          value={email}
          onChangeText={setEmail}
          placeholder="optional"
          placeholderTextColor={d.ink2}
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          accessibilityLabel="Your email"
          style={[styles.line, { backgroundColor: d.surface, color: d.ink }]}
        />

        <View style={[styles.toggleRow, { backgroundColor: d.surface }]}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.toggleTitle, { color: d.ink }]}>Include phone details</Text>
            <Text style={[styles.toggleSub, { color: d.ink2 }]} numberOfLines={3}>
              {deviceLines(device).join(' · ') || 'App and phone model'}. No location or ride data.
            </Text>
          </View>
          <Switch value={includeDevice} onValueChange={setIncludeDevice} trackColor={{ true: AMBER, false: undefined }} accessibilityLabel="Include phone details" />
        </View>

        <TouchableOpacity
          onPress={send}
          disabled={sending}
          accessibilityRole="button"
          accessibilityState={{ disabled: sending, busy: sending }}
          style={[styles.send, { backgroundColor: AMBER, opacity: sending ? 0.7 : 1 }]}
        >
          {sending ? <ActivityIndicator color={INK} /> : <Text style={[styles.sendText, { color: INK }]}>Send report</Text>}
        </TouchableOpacity>
        <TouchableOpacity onPress={emailInstead} accessibilityRole="button" style={styles.alt}>
          <Text style={[styles.altText, { color: d.ink2 }]}>Or email {DEVELOPER_EMAIL}</Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  body: { padding: 16, gap: 10, paddingBottom: 60 },
  lead: { fontFamily: F.bold, fontSize: 14, lineHeight: 19 },
  box: { minHeight: 150, borderRadius: 18, padding: 14, fontFamily: F.regular, fontSize: 15, textAlignVertical: 'top' },
  count: { fontFamily: F.mono, fontSize: 11, textAlign: 'right' },
  problem: { fontFamily: F.bold, fontSize: 13 },
  fieldLabel: { fontFamily: F.bold, fontSize: 12, marginTop: 6 },
  line: { height: 52, borderRadius: 16, paddingHorizontal: 14, fontFamily: F.regular, fontSize: 15 },
  toggleRow: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 18, padding: 14, marginTop: 6 },
  toggleTitle: { fontFamily: F.extra, fontSize: 15 },
  toggleSub: { fontFamily: F.regular, fontSize: 12, marginTop: 2 },
  send: { height: 56, borderRadius: 18, alignItems: 'center', justifyContent: 'center', marginTop: 10 },
  sendText: { fontFamily: F.black, fontSize: 16 },
  alt: { height: 44, alignItems: 'center', justifyContent: 'center' },
  altText: { fontFamily: F.bold, fontSize: 13 },
  thanks: { padding: 24, gap: 12, marginTop: 40 },
  thanksTitle: { fontFamily: F.black, fontSize: 28, letterSpacing: -0.5 },
  thanksSub: { fontFamily: F.regular, fontSize: 15, lineHeight: 21 },
});
