import { Ionicons } from '@expo/vector-icons';
import { format } from 'date-fns';
import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { Button, Card, Chip, SectionTitle } from '../components/ui';
import { FEEDBACK_CATEGORIES, type FeedbackCategory, type FeedbackIssue } from '../sync/feedback';
import { useTeam } from '../sync/TeamContext';
import { radius, spacing, usePalette } from '../theme';

/** Verbesserung vorschlagen: landet als Issue im privaten Daten-Repo des Teams. */
export default function FeedbackScreen() {
  const p = usePalette();
  const team = useTeam();
  const [category, setCategory] = useState<FeedbackCategory>('idea');
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null);
  const [mine, setMine] = useState<FeedbackIssue[] | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const { connected, listFeedback } = team;

  const load = useCallback(() => {
    if (!connected) return;
    listFeedback()
      .then((list) => {
        setMine(list);
        setListError(null);
      })
      .catch((e: unknown) => setListError(e instanceof Error ? e.message : String(e)));
  }, [connected, listFeedback]);

  useEffect(load, [load]);

  const send = async () => {
    if (sending || !text.trim()) return;
    setSending(true);
    setMessage(null);
    const result = await team.submitFeedback({ category, text });
    setSending(false);
    if (!result.ok) return setMessage({ text: result.error, error: true });
    setText('');
    if ('queued' in result) setMessage({ text: `Vorgemerkt. ${result.reason}` });
    else {
      setMessage({ text: `Danke! Gespeichert als Vorschlag #${result.issue.number}.` });
      setMine((list) => [result.issue, ...(list ?? []).filter((i) => i.number !== result.issue.number)]);
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
      <Text style={{ color: p.muted }}>
        Was fehlt, was stört, was geht besser? Dein Vorschlag wird im Team-Repo auf GitHub abgelegt und dort bearbeitet.
      </Text>

      <View style={styles.chips}>
        {FEEDBACK_CATEGORIES.map((c) => (
          <Chip key={c.key} label={c.label} selected={category === c.key} onPress={() => setCategory(c.key)} />
        ))}
      </View>
      <TextInput
        value={text}
        onChangeText={(t) => {
          setText(t);
          setMessage(null);
        }}
        placeholder={category === 'bug' ? 'Was ist passiert? Was hast du erwartet?' : 'Dein Vorschlag – die erste Zeile wird zur Überschrift'}
        placeholderTextColor={p.muted}
        multiline
        accessibilityLabel="Vorschlag"
        style={[styles.input, { color: p.text, borderColor: p.border, backgroundColor: p.card }]}
      />
      <Text style={{ color: p.muted, fontSize: 12 }}>
        Hinweis: Vorschläge sind – anders als die Zeitdaten – nicht verschlüsselt. Alle mit Zugriff auf das Team-Repo
        können sie lesen. Mitgesendet werden nur App-Version und Gerätetyp.
      </Text>
      <Button title={sending ? 'Wird gesendet …' : 'Senden'} icon="send" onPress={() => void send()} disabled={sending || !text.trim()} />
      {message && <Text style={{ color: message.error ? p.danger : p.success }}>{message.text}</Text>}
      {team.pendingFeedback > 0 && (
        <Text style={{ color: p.muted }}>
          {team.pendingFeedback === 1 ? '1 Vorschlag wartet' : `${team.pendingFeedback} Vorschläge warten`} auf das Senden.
        </Text>
      )}

      {!connected ? (
        <Card style={{ gap: spacing.sm }}>
          <Text style={{ color: p.text }}>
            {team.available
              ? 'Zum Senden muss dieses Gerät mit dem Team verbunden sein. Vorschläge werden bis dahin vorgemerkt.'
              : 'Vorschläge können nur aus der Web-App mit Team-Sync gesendet werden.'}
          </Text>
          {team.available && <Button title="Team-Sync einrichten" icon="cloud-outline" variant="secondary" onPress={() => router.push('/connect')} />}
        </Card>
      ) : (
        <View style={{ gap: spacing.sm }}>
          <SectionTitle>Meine Vorschläge</SectionTitle>
          {listError ? (
            <Text style={{ color: p.danger }}>{listError}</Text>
          ) : mine === null ? (
            <Text style={{ color: p.muted }}>Lädt …</Text>
          ) : mine.length === 0 ? (
            <Text style={{ color: p.muted }}>Noch keine Vorschläge gesendet.</Text>
          ) : (
            mine.map((i) => (
              <Pressable
                key={i.number}
                accessibilityRole="link"
                accessibilityLabel={`Vorschlag ${i.number} öffnen`}
                onPress={() => void Linking.openURL(i.url)}
                style={({ pressed }) => [styles.issue, { backgroundColor: p.card, opacity: pressed ? 0.7 : 1 }]}
              >
                <Ionicons
                  name={i.state === 'closed' ? 'checkmark-circle' : 'ellipse-outline'}
                  size={20}
                  color={i.state === 'closed' ? p.success : p.muted}
                />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={{ color: p.text, fontWeight: '600' }} numberOfLines={2}>
                    {i.title}
                  </Text>
                  <Text style={{ color: p.muted, fontSize: 12 }}>
                    #{i.number} · {format(i.createdAt, 'dd.MM.yyyy')} · {i.state === 'closed' ? 'erledigt' : 'offen'}
                    {i.comments > 0 ? ` · ${i.comments} Kommentar${i.comments === 1 ? '' : 'e'}` : ''}
                  </Text>
                </View>
                <Ionicons name="open-outline" size={16} color={p.muted} />
              </Pressable>
            ))
          )}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xl * 2 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  input: {
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.md,
    minHeight: 140,
    fontSize: 16,
    textAlignVertical: 'top',
  },
  issue: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md, borderRadius: radius.md },
});
