import { Linking, Platform, Pressable, ScrollView, Share, StyleSheet, Text, TextInput, View } from 'react-native';
import { useState } from 'react';

import { QrCode } from '../components/QrCode';
import { Button, Card, SectionTitle, Segmented } from '../components/ui';
import { tokenUrl } from '../sync/config';
import { useTeam } from '../sync/TeamContext';
import { radius, spacing, usePalette } from '../theme';

/**
 * Kollegen einladen: QR-Code/Link mit dem (verschlüsselten) Team-Zugang erzeugen.
 * Wer eingeladen wird, braucht nur noch Name und Team-Passwort – kein GitHub-Konto.
 */
export default function InviteScreen() {
  const p = usePalette();
  const team = useTeam();
  const [source, setSource] = useState<'own' | 'other'>('other');
  const [token, setToken] = useState('');
  const [busy, setBusy] = useState(false);
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const create = async () => {
    setBusy(true);
    setError(null);
    setCopied(false);
    const result = await team.createInvite(source === 'other' ? token : undefined);
    setBusy(false);
    if (result.ok) setUrl(result.url);
    else setError(result.error);
  };

  const copy = async () => {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      setError('Kopieren nicht möglich – bitte den Link oben markieren und kopieren.');
    }
  };

  const share = async () => {
    if (!url) return;
    if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.share) {
      await navigator
        .share({ title: 'Einladung TimeTracker', text: 'Einladung ins Team (Passwort sage ich dir persönlich):', url })
        .catch(() => {});
    } else {
      await Share.share({ message: url }).catch(() => {});
    }
  };

  if (!team.connected) {
    return (
      <View style={styles.container}>
        <Text style={{ color: p.text }}>Zum Einladen muss dieses Gerät mit dem Team verbunden sein.</Text>
      </View>
    );
  }

  const inputStyle = [styles.input, { color: p.text, borderColor: p.border, backgroundColor: p.card }];

  if (url) {
    return (
      <ScrollView contentContainerStyle={styles.container}>
        <Card style={{ alignItems: 'center', gap: spacing.md }}>
          <QrCode value={url} />
          <Text style={{ color: p.text, textAlign: 'center' }}>
            Mit der App scannen: <Text style={{ fontWeight: '700' }}>Mit dem Team verbinden → Mit Einladung</Text>
          </Text>
        </Card>
        <Text style={{ color: p.muted }}>
          Dazu braucht die Person nur noch ihren Namen und das <Text style={{ fontWeight: '700' }}>Team-Passwort</Text> – das
          bitte persönlich sagen, nicht zusammen mit dem Link verschicken.
        </Text>
        <Text selectable numberOfLines={3} style={[styles.link, { color: p.muted, backgroundColor: p.track }]}>
          {url}
        </Text>
        <View style={styles.row}>
          <View style={{ flex: 1 }}>
            <Button
              title={copied ? 'Kopiert ✓' : 'Link kopieren'}
              icon="copy-outline"
              variant="secondary"
              onPress={() => void copy()}
            />
          </View>
          <View style={{ flex: 1 }}>
            <Button title="Teilen" icon="share-outline" variant="secondary" onPress={() => void share()} />
          </View>
        </View>
        {error && <Text style={{ color: p.danger }}>{error}</Text>}
        <Button title="Neue Einladung" variant="secondary" onPress={() => setUrl(null)} />
      </ScrollView>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
      <Text style={{ color: p.muted }}>
        Kollegen brauchen kein GitHub-Konto: Sie scannen den QR-Code, geben ihren Namen und das Team-Passwort ein. Die App nutzt
        dafür einen gemeinsamen Team-Zugang (Token), der im QR-Code verschlüsselt steckt.
      </Text>

      <SectionTitle>Welcher Zugang?</SectionTitle>
      <Segmented
        options={[
          { value: 'other', label: 'Eigener Team-Token' },
          { value: 'own', label: 'Meinen teilen' },
        ]}
        value={source}
        onChange={setSource}
      />
      {source === 'other' ? (
        <Card style={{ gap: spacing.sm }}>
          <Text style={{ color: p.text }}>
            Empfohlen: einen extra Token nur fürs Team erstellen. Wird ein Gerät verloren, löschst du nur diesen Token und
            erstellst eine neue Einladung – dein eigener Zugang bleibt.
          </Text>
          <Pressable accessibilityRole="link" onPress={() => void Linking.openURL(tokenUrl(team.repo ?? ''))}>
            <Text style={{ color: p.primary, fontWeight: '600' }}>Team-Token auf GitHub erstellen ↗</Text>
          </Pressable>
          <Text style={{ color: p.muted, fontSize: 12 }}>
            Name z.B. „TimeTracker Team“, Besitzer: die Organisation, Repository: nur das Daten-Repo, Berechtigungen „Contents“
            und „Issues“: Read and write.
          </Text>
          <TextInput
            value={token}
            onChangeText={setToken}
            placeholder="github_pat_…"
            placeholderTextColor={p.muted}
            autoCapitalize="none"
            autoCorrect={false}
            secureTextEntry
            accessibilityLabel="Team-Token"
            style={inputStyle}
          />
        </Card>
      ) : (
        <Card style={{ gap: spacing.sm }}>
          <Text style={{ color: p.text }}>
            Dein Token wird mit dem Team geteilt. Änderungen der Kollegen erscheinen auf GitHub dann unter deinem Konto (mit ihrem
            Namen in der Beschreibung). Erneuerst du deinen Token, brauchen alle eine neue Einladung.
          </Text>
        </Card>
      )}

      <Text style={{ color: p.muted, fontSize: 12 }}>
        Wer Einladung und Team-Passwort hat, kommt an die Team-Daten. Nur an Teammitglieder weitergeben.
      </Text>
      {error && <Text style={{ color: p.danger }}>{error}</Text>}
      <Button
        title={busy ? 'Erstelle …' : 'QR-Code erstellen'}
        icon="qr-code-outline"
        size="large"
        onPress={() => void create()}
        disabled={busy || (source === 'other' && !token.trim())}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: spacing.lg, gap: spacing.lg, paddingBottom: spacing.xl * 2 },
  input: { borderWidth: 1, borderRadius: radius.md, paddingHorizontal: spacing.md, height: 48, fontSize: 16 },
  link: { padding: spacing.sm, borderRadius: radius.sm, fontSize: 12, overflow: 'hidden' },
  row: { flexDirection: 'row', gap: spacing.sm },
});
