import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { DeleteAction } from '../../components/DeleteAction';
import { ScanButton } from '../../components/ScanButton';
import { Button, Card, SectionTitle } from '../../components/ui';
import { useData, useQuery } from '../../data/DataProvider';
import { articleLabel } from '../../hooks/useArticles';
import { radius, spacing, usePalette } from '../../theme';

/** Artikel bearbeiten (`/article/<id>`) oder anlegen (`/article/new`). */
export default function ArticleScreen() {
  const p = usePalette();
  const { id } = useLocalSearchParams<{ id: string }>();
  const isNew = id === 'new';
  const { mutate } = useData();
  const { data: article } = useQuery((r) => (isNew ? Promise.resolve(null) : r.articles.get(id)), [id]);

  const [number, setNumber] = useState('');
  const [name, setName] = useState('');
  const [device, setDevice] = useState('');
  const [loaded, setLoaded] = useState(isNew);
  const [error, setError] = useState<string | null>(null);

  if (article && !loaded) {
    setNumber(article.number);
    setName(article.name);
    setDevice(article.device);
    setLoaded(true);
  }

  const save = async () => {
    try {
      const input = { number, name, device };
      await mutate(async (r) => {
        if (isNew) await r.articles.create(input);
        else await r.articles.update(id, input);
      });
      router.back();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };


  if (!loaded) return null;

  const inputStyle = [styles.input, { color: p.text, borderColor: p.border, backgroundColor: p.card }];

  return (
    <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: isNew ? 'Artikel anlegen' : 'Artikel bearbeiten' }} />
      <Card style={{ gap: spacing.lg }}>
        <View>
          <SectionTitle>Artikelnummer</SectionTitle>
          <View style={styles.row}>
            <TextInput
              value={number}
              onChangeText={(t) => {
                setNumber(t);
                setError(null);
              }}
              placeholder="z.B. 07123456 – leer lassen, wenn es keine gibt"
              placeholderTextColor={p.muted}
              autoCapitalize="characters"
              autoCorrect={false}
              autoFocus={isNew}
              accessibilityLabel="Artikelnummer"
              style={[inputStyle, { flex: 1 }]}
            />
            <ScanButton label="Artikelnummer scannen" onScan={setNumber} />
          </View>
        </View>
        <View>
          <SectionTitle>Benennung</SectionTitle>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="z.B. Halter links"
            placeholderTextColor={p.muted}
            accessibilityLabel="Benennung"
            style={inputStyle}
          />
          <Text style={{ color: p.muted, fontSize: 12, marginTop: 4 }}>
            Erscheint im Timer-Namen und kann beim Start statt der Nummer gesucht werden.
          </Text>
        </View>
        <View>
          <SectionTitle>Endgerät</SectionTitle>
          <TextInput
            value={device}
            onChangeText={setDevice}
            placeholder="Notiz, z.B. Gerät/Baugruppe, in die der Artikel eingebaut wird"
            placeholderTextColor={p.muted}
            multiline
            accessibilityLabel="Endgerät"
            style={[inputStyle, { minHeight: 80, textAlignVertical: 'top', paddingTop: spacing.md }]}
          />
        </View>
      </Card>

      {error && <Text style={{ color: p.danger }}>{error}</Text>}
      <Button title="Speichern" icon="checkmark" onPress={() => void save()} disabled={!number.trim() && !name.trim()} />
      {!isNew && article && (
        <DeleteAction
          kind="article"
          targetId={article.id}
          owner={null}
          label={articleLabel(article)}
          title="Artikel löschen"
          hint="Aufträge mit diesem Artikel bleiben erhalten, verlieren aber die Zuordnung."
          doDelete={(r) => r.articles.remove(article.id)}
          onDone={() => router.back()}
        />
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: spacing.lg, gap: spacing.lg },
  row: { flexDirection: 'row', gap: spacing.sm },
  input: { borderWidth: 1, borderRadius: radius.md, paddingHorizontal: spacing.md, minHeight: 48, fontSize: 16 },
});
