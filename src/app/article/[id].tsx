import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { ScanButton } from '../../components/ScanButton';
import { Button, Card, SectionTitle } from '../../components/ui';
import { useData, useQuery } from '../../data/DataProvider';
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
  const [description, setDescription] = useState('');
  const [loaded, setLoaded] = useState(isNew);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  if (article && !loaded) {
    setNumber(article.number);
    setName(article.name);
    setDescription(article.description);
    setLoaded(true);
  }

  const save = async () => {
    try {
      const input = { number, name, description };
      await mutate(async (r) => {
        if (isNew) await r.articles.create(input);
        else await r.articles.update(id, input);
      });
      router.back();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const remove = async () => {
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    await mutate((r) => r.articles.remove(id));
    router.back();
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
              placeholder="z.B. 4711-200"
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
          <SectionTitle>Name</SectionTitle>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="Kurzname, z.B. Halter links"
            placeholderTextColor={p.muted}
            accessibilityLabel="Name"
            style={inputStyle}
          />
        </View>
        <View>
          <SectionTitle>Bezeichnung</SectionTitle>
          <TextInput
            value={description}
            onChangeText={setDescription}
            placeholder="Optional: Material, Ausführung, …"
            placeholderTextColor={p.muted}
            multiline
            accessibilityLabel="Bezeichnung"
            style={[inputStyle, { minHeight: 80, textAlignVertical: 'top', paddingTop: spacing.md }]}
          />
        </View>
      </Card>

      {error && <Text style={{ color: p.danger }}>{error}</Text>}
      <Button title="Speichern" icon="checkmark" onPress={() => void save()} disabled={!number.trim()} />
      {!isNew && (
        <View style={{ gap: spacing.sm }}>
          <Button
            title={confirmDelete ? 'Wirklich löschen?' : 'Löschen'}
            icon="trash-outline"
            variant={confirmDelete ? 'danger' : 'secondary'}
            onPress={() => void remove()}
          />
          {confirmDelete && (
            <>
              <Text style={{ color: p.muted, fontSize: 12 }}>
                Einträge mit diesem Artikel bleiben erhalten, verlieren aber die Zuordnung.
              </Text>
              <Button title="Abbrechen" variant="secondary" onPress={() => setConfirmDelete(false)} />
            </>
          )}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: spacing.lg, gap: spacing.lg },
  row: { flexDirection: 'row', gap: spacing.sm },
  input: { borderWidth: 1, borderRadius: radius.md, paddingHorizontal: spacing.md, minHeight: 48, fontSize: 16 },
});
