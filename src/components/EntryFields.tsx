import { Ionicons } from '@expo/vector-icons';
import { useImperativeHandle, useState, type Ref } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { useData } from '../data/DataProvider';
import { looksLikeNumber } from '../domain/codes';
import { articleLabel, findArticleByName, matchArticles, type ArticlesData } from '../hooks/useArticles';
import { radius, spacing, usePalette } from '../theme';
import { ScanButton } from './ScanButton';
import { Button } from './ui';

export interface ArticleFieldHandle {
  /**
   * Übernimmt getippten Text. true = erledigt (leer oder bekannter Artikel per Nummer oder Benennung),
   * false = nichts gefunden, Rückfrage wird angezeigt.
   */
  commit(): Promise<boolean>;
}

/**
 * Artikel per Nummer oder Benennung suchen, aus Vorschlägen wählen oder scannen.
 * Gescannte unbekannte Nummern werden sofort angelegt, getippte erst nach Rückfrage.
 */
export function ArticleField({
  articles,
  value,
  onChange,
  autoFocus,
  ref,
}: {
  articles: ArticlesData;
  value: string | null;
  onChange: (articleId: string | null) => void;
  autoFocus?: boolean;
  ref?: Ref<ArticleFieldHandle>;
}) {
  const p = usePalette();
  const { mutate } = useData();
  const [text, setText] = useState('');
  const [unknown, setUnknown] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const selected = value ? articles.byId.get(value) : undefined;

  const select = (id: string) => {
    setText('');
    setUnknown(null);
    setError(null);
    onChange(id);
  };

  /** Neu anlegen: mit Nummer (gescannt/getippt) oder nur mit Bezeichnung */
  const create = async (number: string, name = '') => {
    try {
      const article = await mutate((r) => r.articles.create({ number, name, device: '' }));
      select(article.id);
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      return false;
    }
  };

  const findExact = (number: string) => (number.trim() ? articles.articles.find((a) => a.number === number.trim()) : undefined);

  const commit = async () => {
    const number = text.trim();
    if (!number) return true;
    const found = findExact(number) ?? findArticleByName(articles.articles, number);
    if (found) {
      select(found.id);
      return true;
    }
    setUnknown(number);
    return false;
  };
  useImperativeHandle(ref, () => ({ commit }));

  const onScan = async (code: string) => {
    const found = findExact(code);
    if (found) select(found.id);
    else await create(code);
  };

  if (selected) {
    return (
      <View style={[styles.selected, { borderColor: p.primary, backgroundColor: p.primary + '14' }]}>
        <Ionicons name="cube-outline" size={22} color={p.primary} />
        <View style={{ flex: 1 }}>
          <Text style={[styles.selectedNumber, { color: p.text }]}>{articleLabel(selected)}</Text>
          {selected.device ? <Text style={{ color: p.muted }}>Endgerät: {selected.device}</Text> : null}
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Artikel ändern"
          hitSlop={10}
          onPress={() => {
            setText(selected.number);
            onChange(null);
          }}
        >
          <Text style={{ color: p.primary, fontWeight: '600' }}>Ändern</Text>
        </Pressable>
      </View>
    );
  }

  const suggestions = text.trim() ? matchArticles(articles.articles, text, 5) : [];

  return (
    <View style={{ gap: spacing.sm }}>
      <View style={styles.inputRow}>
        <TextInput
          autoFocus={autoFocus}
          value={text}
          onChangeText={(t) => {
            setText(t);
            setUnknown(null);
            setError(null);
          }}
          onSubmitEditing={() => void commit()}
          placeholder="Artikelnummer oder Benennung"
          placeholderTextColor={p.muted}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="done"
          accessibilityLabel="Artikelnummer oder Benennung"
          style={[styles.input, { color: p.text, borderColor: p.border, backgroundColor: p.card }]}
        />
        <ScanButton label="Artikelnummer scannen" onScan={onScan} />
      </View>

      {unknown && !looksLikeNumber(unknown) ? (
        <View style={[styles.warn, { borderColor: p.danger, backgroundColor: p.danger + '12' }]}>
          <Text style={{ color: p.text }}>
            Keinen Artikel „<Text style={{ fontWeight: '700' }}>{unknown}</Text>“ gefunden. Nur mit Bezeichnung anlegen
            (ohne Artikelnummer)?
          </Text>
          <View style={styles.warnButtons}>
            <View style={{ flex: 1 }}>
              <Button title="Korrigieren" variant="secondary" onPress={() => setUnknown(null)} />
            </View>
            <View style={{ flex: 1 }}>
              <Button title="Nur mit Bezeichnung anlegen" icon="add" onPress={() => void create('', unknown)} />
            </View>
          </View>
        </View>
      ) : unknown ? (
        <View style={[styles.warn, { borderColor: p.danger, backgroundColor: p.danger + '12' }]}>
          <Text style={{ color: p.text }}>
            Artikel <Text style={{ fontWeight: '700' }}>{unknown}</Text> ist nicht in der Liste. Vertippt?
          </Text>
          <View style={styles.warnButtons}>
            <View style={{ flex: 1 }}>
              <Button title="Korrigieren" variant="secondary" onPress={() => setUnknown(null)} />
            </View>
            <View style={{ flex: 1 }}>
              <Button title="Neu anlegen" icon="add" onPress={() => void create(unknown)} />
            </View>
          </View>
        </View>
      ) : (
        suggestions.length > 0 && (
          <View style={[styles.suggestions, { borderColor: p.border, backgroundColor: p.card }]}>
            {suggestions.map((a) => (
              <Pressable
                key={a.id}
                accessibilityRole="button"
                onPress={() => select(a.id)}
                style={({ pressed }) => [styles.suggestion, { backgroundColor: pressed ? p.track : 'transparent' }]}
              >
                <Text style={{ color: p.text, fontWeight: '600' }} numberOfLines={1}>
                  {a.name || a.number}
                </Text>
                <Text style={{ color: p.muted, fontSize: 13 }} numberOfLines={1}>
                  {[a.name ? a.number : '', a.device].filter(Boolean).join(' · ')}
                </Text>
              </Pressable>
            ))}
          </View>
        )
      )}
      {error && <Text style={{ color: p.danger }}>{error}</Text>}
    </View>
  );
}

/** Auftragsnummer eingeben oder scannen. */
export function OrderField({
  value,
  onChange,
  autoFocus,
  onSubmit,
}: {
  value: string;
  onChange: (orderNo: string) => void;
  autoFocus?: boolean;
  onSubmit?: () => void;
}) {
  const p = usePalette();
  return (
    <View style={styles.inputRow}>
      <TextInput
        autoFocus={autoFocus}
        value={value}
        onChangeText={onChange}
        onSubmitEditing={onSubmit}
        placeholder="Auftragsnummer"
        placeholderTextColor={p.muted}
        autoCapitalize="characters"
        autoCorrect={false}
        returnKeyType="done"
        accessibilityLabel="Auftragsnummer"
        style={[styles.input, { color: p.text, borderColor: p.border, backgroundColor: p.card }]}
      />
      <ScanButton label="Auftragsnummer scannen" onScan={(code) => onChange(code)} />
    </View>
  );
}

/** Stückzahl als Text (leer = keine Angabe) mit −/+ Buttons. */
export function QuantityField({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const p = usePalette();
  const current = Number.parseInt(value, 10);
  const step = (delta: number) => onChange(String(Math.max(0, (Number.isFinite(current) ? current : 0) + delta)));
  return (
    <View style={styles.qtyRow}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Stückzahl verringern"
        onPress={() => step(-1)}
        style={[styles.qtyButton, { backgroundColor: p.track }]}
      >
        <Ionicons name="remove" size={26} color={p.text} />
      </Pressable>
      <TextInput
        value={value}
        onChangeText={(t) => onChange(t.replace(/[^0-9]/g, ''))}
        keyboardType="number-pad"
        accessibilityLabel="Stückzahl"
        placeholder="–"
        placeholderTextColor={p.muted}
        style={[styles.qtyInput, { color: p.text, borderColor: p.border, backgroundColor: p.card }]}
      />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Stückzahl erhöhen"
        onPress={() => step(1)}
        style={[styles.qtyButton, { backgroundColor: p.track }]}
      >
        <Ionicons name="add" size={26} color={p.text} />
      </Pressable>
    </View>
  );
}

/** Text aus dem Stückzahl-Feld → Zahl oder null. */
export function parseQuantity(value: string): number | null {
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

const styles = StyleSheet.create({
  inputRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  input: { flex: 1, minWidth: 0, borderWidth: 1, borderRadius: radius.md, paddingHorizontal: spacing.md, height: 48, fontSize: 18 },
  selected: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, borderWidth: 1, borderRadius: radius.md, padding: spacing.md },
  selectedNumber: { fontSize: 18, fontWeight: '700' },
  warn: { borderWidth: 1, borderRadius: radius.md, padding: spacing.md, gap: spacing.md },
  warnButtons: { flexDirection: 'row', gap: spacing.sm },
  suggestions: { borderWidth: 1, borderRadius: radius.md, overflow: 'hidden' },
  suggestion: { gap: 2, paddingHorizontal: spacing.md, paddingVertical: spacing.sm + 2 },
  qtyRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, justifyContent: 'center' },
  qtyButton: { width: 56, height: 56, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  qtyInput: { width: 110, height: 56, borderWidth: 1, borderRadius: radius.md, textAlign: 'center', fontSize: 28, fontWeight: '700' },
});
