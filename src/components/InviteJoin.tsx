import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { ActivityIndicator, Platform, StyleSheet, Text, TextInput, View } from 'react-native';

import { decodeInvite, type InvitePayload } from '../sync/invite';
import { useTeam } from '../sync/TeamContext';
import { radius, spacing, usePalette } from '../theme';
import { ScannerView } from './ScannerView';
import { Button, Card, SectionTitle } from './ui';

/** iPhone im Safari-Tab (nicht vom Home-Bildschirm): dort verbundene Daten landen nicht in der App. */
function iosBrowserTab(): boolean {
  if (Platform.OS !== 'web' || typeof navigator === 'undefined') return false;
  const ios = /iPhone|iPad|iPod/.test(navigator.userAgent);
  const standalone = (navigator as { standalone?: boolean }).standalone === true;
  return ios && !standalone;
}

/**
 * Mit einer Einladung verbinden: QR-Code scannen (oder Link einfügen), Namen und Team-Passwort eingeben.
 * Kein GitHub-Konto nötig.
 */
export function InviteJoin({ initialInvite, onDone }: { initialInvite?: string | null; onDone: () => void }) {
  const p = usePalette();
  const team = useTeam();
  const [invite, setInvite] = useState<InvitePayload | null>(() => (initialInvite ? decodeInvite(initialInvite) : null));
  const [raw, setRaw] = useState(initialInvite ?? '');
  const [pasted, setPasted] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [nameTaken, setNameTaken] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(
    initialInvite && !invite ? 'Der Link enthält keine gültige Einladung.' : null,
  );

  const take = (text: string) => {
    const found = decodeInvite(text);
    if (!found) {
      setError('Das ist kein Einladungs-Code.');
      return false;
    }
    setError(null);
    setRaw(text);
    setInvite(found);
    return true;
  };

  const submit = async (confirmName = false) => {
    setError(null);
    setBusy(true);
    try {
      const result = await team.connectWithInvite({ invite: raw, name, password, confirmName });
      if (result.ok) onDone();
      else if ('nameTaken' in result) setNameTaken(true);
      else setError(result.error);
    } finally {
      setBusy(false);
    }
  };

  const inputStyle = [styles.input, { color: p.text, borderColor: p.border, backgroundColor: p.card }];

  if (!invite) {
    return (
      <View style={{ gap: spacing.md }}>
        <ScannerView hint="Einladungs-QR-Code scannen" kind="qr" onScan={take} />
        <Text style={{ color: p.muted }}>
          Den QR-Code bekommst du von der Person, die das Team eingerichtet hat (Einstellungen → Kollegen einladen).
        </Text>
        <View style={{ gap: spacing.xs }}>
          <SectionTitle>Oder Einladungslink einfügen</SectionTitle>
          <TextInput
            value={pasted}
            onChangeText={(t) => {
              setPasted(t);
              setError(null);
            }}
            placeholder="https://…/join#…"
            placeholderTextColor={p.muted}
            autoCapitalize="none"
            autoCorrect={false}
            accessibilityLabel="Einladungslink"
            style={inputStyle}
          />
          <Button title="Übernehmen" variant="secondary" onPress={() => take(pasted)} disabled={!pasted.trim()} />
        </View>
        {error && <Text style={{ color: p.danger }}>{error}</Text>}
      </View>
    );
  }

  return (
    <View style={{ gap: spacing.lg }}>
      {iosBrowserTab() && (
        <Card style={{ gap: spacing.xs, borderColor: p.warning }}>
          <Text style={{ color: p.text, fontWeight: '700' }}>Tipp fürs iPhone</Text>
          <Text style={{ color: p.muted }}>
            Am besten zuerst die App über Teilen → „Zum Home-Bildschirm“ hinzufügen, sie von dort öffnen und unter „Mit dem Team
            verbinden“ den QR-Code scannen. Was du hier im Safari-Tab einrichtest, gilt nur für Safari.
          </Text>
        </Card>
      )}
      <Card style={{ gap: spacing.sm }}>
        <View style={styles.row}>
          <Ionicons name="mail-open-outline" size={22} color={p.success} />
          <Text style={{ color: p.text, fontWeight: '700', flex: 1 }}>Einladung für {invite.r}</Text>
        </View>
        <Text style={{ color: p.muted }}>Gib deinen Namen und das Team-Passwort ein. Ein GitHub-Konto brauchst du nicht.</Text>
      </Card>
      <Card style={{ gap: spacing.lg }}>
        <View style={{ gap: spacing.xs }}>
          <SectionTitle>Dein Name</SectionTitle>
          <TextInput
            value={name}
            onChangeText={(t) => {
              setName(t);
              setNameTaken(false);
            }}
            placeholder="z.B. Max Müller"
            placeholderTextColor={p.muted}
            autoCapitalize="words"
            autoCorrect={false}
            accessibilityLabel="Dein Name"
            style={inputStyle}
          />
          <Text style={{ color: p.muted, fontSize: 12 }}>
            So sehen dich die anderen im Team. Bitte auf allen Geräten gleich schreiben.
          </Text>
        </View>
        <View style={{ gap: spacing.xs }}>
          <SectionTitle>Team-Passwort</SectionTitle>
          <TextInput
            value={password}
            onChangeText={setPassword}
            placeholder="Team-Passwort"
            placeholderTextColor={p.muted}
            secureTextEntry
            accessibilityLabel="Team-Passwort"
            style={inputStyle}
          />
        </View>
      </Card>

      {nameTaken && (
        <Card style={{ gap: spacing.sm, borderColor: p.warning }}>
          <Text style={{ color: p.text }}>
            Den Namen <Text style={{ fontWeight: '700' }}>{name.trim()}</Text> gibt es im Team schon. Bist du das auf einem
            weiteren Gerät?
          </Text>
          <Button title="Ja, das bin ich" onPress={() => void submit(true)} disabled={busy} />
          <Button title="Anderen Namen wählen" variant="secondary" onPress={() => setNameTaken(false)} />
        </Card>
      )}
      {error && <Text style={{ color: p.danger }}>{error}</Text>}
      {busy ? (
        <View style={styles.busy}>
          <ActivityIndicator color={p.primary} />
          <Text style={{ color: p.muted }}>Verbinde und prüfe das Passwort …</Text>
        </View>
      ) : (
        !nameTaken && (
          <Button
            title="Verbinden"
            icon="cloud-done-outline"
            size="large"
            onPress={() => void submit()}
            disabled={!name.trim() || !password}
          />
        )
      )}
      <Button
        title="Andere Einladung"
        variant="secondary"
        onPress={() => {
          setInvite(null);
          setRaw('');
          setNameTaken(false);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  input: { borderWidth: 1, borderRadius: radius.md, paddingHorizontal: spacing.md, height: 48, fontSize: 16 },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  busy: { flexDirection: 'row', gap: spacing.md, alignItems: 'center', justifyContent: 'center', padding: spacing.md },
});
