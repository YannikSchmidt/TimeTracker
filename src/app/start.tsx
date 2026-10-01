import { router, useLocalSearchParams } from 'expo-router';
import { useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import {
  ArticleField,
  OrderField,
  QuantityField,
  parseQuantity,
  type ArticleFieldHandle,
} from '../components/EntryFields';
import { Button } from '../components/ui';
import { useData, useQuery } from '../data/DataProvider';
import { suggestQuantity } from '../domain/quantity';
import { DEFAULT_SETTINGS } from '../domain/types';
import { useArticles } from '../hooks/useArticles';
import { radius, spacing, usePalette } from '../theme';

const STEPS = ['Artikel', 'Auftrag', 'Stückzahl'] as const;

/**
 * Abfrage vor dem Start: Artikel → Auftrag → Stückzahl. Jeder Schritt ist überspringbar;
 * der Timer startet erst am Ende.
 */
export default function StartScreen() {
  const p = usePalette();
  const params = useLocalSearchParams<{ valueIds?: string; note?: string }>();
  const { mutate } = useData();
  const articles = useArticles();
  const { data } = useQuery(async (r) => ({ entries: await r.entries.listAll(), settings: await r.settings.get() }));
  const articleRef = useRef<ArticleFieldHandle>(null);

  const [step, setStep] = useState(0);
  const [articleId, setArticleId] = useState<string | null>(null);
  const [orderNo, setOrderNo] = useState('');
  const [quantity, setQuantity] = useState('');
  const [starting, setStarting] = useState(false);

  const suggestion = suggestQuantity(data?.entries ?? [], articleId, (data?.settings ?? DEFAULT_SETTINGS).defaultQuantity);
  const article = articleId ? articles.byId.get(articleId) : undefined;

  const goToQuantity = () => {
    setQuantity(String(suggestion.quantity));
    setStep(2);
  };

  const next = async () => {
    if (step === 0) {
      if (!(await articleRef.current?.commit())) return;
      setStep(1);
    } else if (step === 1) {
      goToQuantity();
    }
  };

  const skip = () => {
    if (step === 0) {
      setArticleId(null);
      setStep(1);
    } else if (step === 1) {
      setOrderNo('');
      goToQuantity();
    } else {
      void start(null);
    }
  };

  const start = async (qty: number | null) => {
    if (starting) return;
    setStarting(true);
    const valueIds = params.valueIds ? (JSON.parse(params.valueIds) as string[]) : [];
    await mutate((r) =>
      r.entries.start({ articleId, orderNo: orderNo.trim() || null, quantity: qty, valueIds, note: params.note ?? '' }),
    );
    router.back();
  };

  return (
    <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
      <View style={styles.progress}>
        {STEPS.map((label, i) => (
          <View key={label} style={styles.progressItem}>
            <View style={[styles.progressBar, { backgroundColor: i <= step ? p.primary : p.track }]} />
            <Text style={{ color: i === step ? p.text : p.muted, fontSize: 12, fontWeight: i === step ? '700' : '400' }}>
              {i + 1}. {label}
            </Text>
          </View>
        ))}
      </View>

      {step === 0 && (
        <View style={styles.step}>
          <Text style={[styles.title, { color: p.text }]}>Welcher Artikel?</Text>
          <ArticleField ref={articleRef} articles={articles} value={articleId} onChange={setArticleId} autoFocus />
        </View>
      )}

      {step === 1 && (
        <View style={styles.step}>
          <Text style={[styles.title, { color: p.text }]}>Welcher Auftrag?</Text>
          <OrderField value={orderNo} onChange={setOrderNo} autoFocus onSubmit={goToQuantity} />
        </View>
      )}

      {step === 2 && (
        <View style={styles.step}>
          <Text style={[styles.title, { color: p.text }]}>Wie viele Stück?</Text>
          <QuantityField value={quantity} onChange={setQuantity} />
          <Text style={[styles.hint, { color: p.muted }]}>
            {suggestion.source === 'history' && article
              ? `Vorschlag: am häufigsten bei Artikel ${article.number}`
              : 'Vorschlag: Standard-Stückzahl'}
          </Text>
        </View>
      )}

      <View style={[styles.summary, { backgroundColor: p.card, borderColor: p.border }]}>
        <Summary label="Artikel" value={article ? article.number + (article.name ? ` · ${article.name}` : '') : '–'} />
        <Summary label="Auftrag" value={orderNo.trim() || '–'} />
      </View>

      <View style={styles.buttons}>
        {step < 2 ? (
          <Button title="Weiter" icon="arrow-forward" onPress={() => void next()} />
        ) : (
          <Button title="Timer starten" icon="play" onPress={() => void start(parseQuantity(quantity))} disabled={starting} />
        )}
        <Button title="Überspringen" variant="secondary" onPress={skip} disabled={starting} />
        {step > 0 && <Button title="Zurück" variant="secondary" icon="arrow-back" onPress={() => setStep(step - 1)} />}
      </View>
    </ScrollView>
  );
}

function Summary({ label, value }: { label: string; value: string }) {
  const p = usePalette();
  return (
    <View style={styles.summaryRow}>
      <Text style={{ color: p.muted }}>{label}</Text>
      <Text style={{ color: p.text, fontWeight: '600', flexShrink: 1 }} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { padding: spacing.lg, gap: spacing.xl },
  progress: { flexDirection: 'row', gap: spacing.sm },
  progressItem: { flex: 1, gap: 6 },
  progressBar: { height: 4, borderRadius: 2 },
  step: { gap: spacing.lg },
  title: { fontSize: 24, fontWeight: '700' },
  hint: { textAlign: 'center' },
  summary: { borderWidth: StyleSheet.hairlineWidth, borderRadius: radius.md, padding: spacing.md, gap: spacing.xs },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.md },
  buttons: { gap: spacing.sm },
});
