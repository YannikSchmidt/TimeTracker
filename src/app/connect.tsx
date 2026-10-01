import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Linking, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { Button, Card, SectionTitle } from '../components/ui';
import { DEFAULT_DATA_REPO, normalizeRepo, tokenUrl } from '../sync/config';
import { useTeam } from '../sync/TeamContext';
import { radius, spacing, usePalette } from '../theme';

/** Team-Sync einrichten: Daten-Repo, persönlicher Token und Team-Passwort. */
export default function ConnectScreen() {
  const p = usePalette();
  const team = useTeam();
  const [repo, setRepo] = useState(team.repo ?? DEFAULT_DATA_REPO);
  const [token, setToken] = useState('');
  const [password, setPassword] = useState('');
  const [password2, setPassword2] = useState('');
  const [needsNewPassword, setNeedsNewPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const repoName = normalizeRepo(repo);
  const repoValid = /^[\w.-]+\/[\w.-]+$/.test(repoName);

  const submit = async () => {
    setError(null);
    if (needsNewPassword && password !== password2) {
      setError('Die beiden Passwörter stimmen nicht überein.');
      return;
    }
    setBusy(true);
    try {
      const result = await team.connect({ repo: repoName, token, password, createPassword: needsNewPassword });
      if (result.ok) {
        router.back();
      } else if ('needsNewPassword' in result) {
        setNeedsNewPassword(true);
      } else {
        setError(result.error);
      }
    } finally {
      setBusy(false);
    }
  };

  if (!team.available) {
    return (
      <View style={styles.container}>
        <Text style={{ color: p.text }}>
          Team-Sync gibt es in der Web-App unter ihrer eigenen Adresse. In dieser Ansicht werden die Daten nur auf diesem
          Gerät gespeichert.
        </Text>
      </View>
    );
  }

  if (team.connected) {
    return (
      <ScrollView contentContainerStyle={styles.container}>
        <Card style={{ gap: spacing.sm }}>
          <Text style={{ color: p.text, fontSize: 16 }}>
            Verbunden als <Text style={{ fontWeight: '700' }}>{team.name ?? team.login}</Text> ({team.login})
          </Text>
          <Text style={{ color: p.muted }}>Daten-Repo: {team.repo}</Text>
        </Card>
        <Button title="Fertig" onPress={() => router.back()} />
      </ScrollView>
    );
  }

  const inputStyle = [styles.input, { color: p.text, borderColor: p.border, backgroundColor: p.card }];

  return (
    <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
      <Text style={[styles.title, { color: p.text }]}>Team-Sync einrichten</Text>
      <Text style={{ color: p.muted }}>
        Deine Daten werden verschlüsselt im privaten Daten-Repo des Teams gespeichert und zwischen allen Geräten und Personen
        abgeglichen. Ohne das Team-Passwort kann niemand sie lesen – auch GitHub nicht.
      </Text>

      <Card style={{ gap: spacing.lg }}>
        <View style={{ gap: spacing.xs }}>
          <SectionTitle>Daten-Repo</SectionTitle>
          <TextInput
            value={repo}
            onChangeText={setRepo}
            placeholder="organisation/TimeTracker-Daten"
            placeholderTextColor={p.muted}
            autoCapitalize="none"
            autoCorrect={false}
            accessibilityLabel="Daten-Repo"
            style={inputStyle}
          />
        </View>

        <View style={{ gap: spacing.xs }}>
          <SectionTitle>Persönlicher Token</SectionTitle>
          <TextInput
            value={token}
            onChangeText={setToken}
            placeholder="github_pat_…"
            placeholderTextColor={p.muted}
            autoCapitalize="none"
            autoCorrect={false}
            secureTextEntry
            accessibilityLabel="Persönlicher Token"
            style={inputStyle}
          />
          <Pressable accessibilityRole="link" onPress={() => void Linking.openURL(tokenUrl(repoName))}>
            <Text style={{ color: p.primary, fontWeight: '600' }}>Token auf GitHub erstellen ↗</Text>
          </Pressable>
          <Text style={{ color: p.muted, fontSize: 12 }}>
            Art „Fine-grained“, Besitzer: die Organisation, Repository: nur das Daten-Repo, Berechtigung „Contents: Read and
            write“. Jede Person nutzt ihren eigenen Token – so ist nachvollziehbar, wer was geändert hat.
          </Text>
        </View>

        <View style={{ gap: spacing.xs }}>
          <SectionTitle>Team-Passwort</SectionTitle>
          {needsNewPassword && (
            <Text style={{ color: p.warning }}>
              Für dieses Team gibt es noch kein Passwort. Du legst es jetzt fest (mindestens 8 Zeichen) – alle anderen
              brauchen dasselbe. Ohne Passwort sind die Daten nicht mehr lesbar, also gut aufbewahren!
            </Text>
          )}
          <TextInput
            value={password}
            onChangeText={setPassword}
            placeholder="Team-Passwort"
            placeholderTextColor={p.muted}
            secureTextEntry
            accessibilityLabel="Team-Passwort"
            style={inputStyle}
          />
          {needsNewPassword && (
            <TextInput
              value={password2}
              onChangeText={setPassword2}
              placeholder="Passwort wiederholen"
              placeholderTextColor={p.muted}
              secureTextEntry
              accessibilityLabel="Passwort wiederholen"
              style={inputStyle}
            />
          )}
          <Text style={{ color: p.muted, fontSize: 12 }}>Wird nur einmal pro Gerät abgefragt und nie gespeichert oder übertragen.</Text>
        </View>
      </Card>

      {error && <Text style={{ color: p.danger }}>{error}</Text>}
      {busy ? (
        <View style={styles.busy}>
          <ActivityIndicator color={p.primary} />
          <Text style={{ color: p.muted }}>Verbinde und prüfe das Passwort …</Text>
        </View>
      ) : (
        <Button
          title={needsNewPassword ? 'Passwort festlegen & verbinden' : 'Verbinden'}
          icon="cloud-done-outline"
          size="large"
          onPress={() => void submit()}
          disabled={!repoValid || !token.trim() || !password}
        />
      )}
      <Button
        title="Ohne Team-Sync nur auf diesem Gerät nutzen"
        variant="secondary"
        onPress={() => {
          team.setLocalOnly(true);
          router.back();
        }}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: spacing.lg, gap: spacing.lg, paddingBottom: spacing.xl * 2 },
  title: { fontSize: 24, fontWeight: '800' },
  input: { borderWidth: 1, borderRadius: radius.md, paddingHorizontal: spacing.md, height: 48, fontSize: 16 },
  busy: { flexDirection: 'row', gap: spacing.md, alignItems: 'center', justifyContent: 'center', padding: spacing.md },
});
