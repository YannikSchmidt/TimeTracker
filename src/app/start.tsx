import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { ArticleField, QuantityField, parseQuantity, type ArticleFieldHandle } from '../components/EntryFields';
import { ScannerView } from '../components/ScannerView';
import { Button, Chip, SectionTitle } from '../components/ui';
import { useData } from '../data/DataProvider';
import { suggestQuantity } from '../domain/quantity';
import { frequentArticles, knownOrders, lastJobForOrder, recentOrders } from '../domain/suggestions';
import { articleLabel, useArticles } from '../hooks/useArticles';
import { useWork } from '../hooks/useWork';
import { radius, spacing, usePalette } from '../theme';

type Step = 'order' | 'article' | 'confirm';

/**
 * Neuer Auftrag, so schnell wie möglich: Auftrags-Code scannen → (Artikel-Code scannen) → Start.
 * Ist der Auftrag schon bekannt, werden Artikel und Stückzahl übernommen.
 */
export default function StartScreen() {
  const p = usePalette();
  const { mutate } = useData();
  const work = useWork();
  const articles = useArticles();
  const articleRef = useRef<ArticleFieldHandle>(null);
  /** Wurde im Eintipp-Modus ein Artikel gewählt? (verhindert „ohne Artikel“ beim Weiter) */
  const picked = useRef(false);

  const [step, setStep] = useState<Step>('order');
  const [orderNo, setOrderNo] = useState<string | null>(null);
  const [articleId, setArticleId] = useState<string | null>(null);
  const [quantity, setQuantity] = useState('');
  const [quantityHint, setQuantityHint] = useState('');
  const [typing, setTyping] = useState(false);
  const [typedOrder, setTypedOrder] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);

  const goConfirm = (order: string | null, article: string | null) => {
    const last = order ? lastJobForOrder(work.jobs, order) : null;
    if (last?.quantity != null && last.articleId === article) {
      setQuantity(String(last.quantity));
      setQuantityHint(`wie beim letzten Mal bei Auftrag ${order}`);
    } else {
      const s = suggestQuantity(work.jobs, article, work.settings.defaultQuantity);
      setQuantity(String(s.quantity));
      setQuantityHint(s.source === 'history' ? 'häufigste Stückzahl dieses Artikels' : 'Standard-Stückzahl');
    }
    setTyping(false);
    setStep('confirm');
  };

  const chooseOrder = (value: string | null) => {
    const order = value?.trim() || null;
    setOrderNo(order);
    // Bekannter Auftrag → Artikel übernehmen und direkt zur Bestätigung
    const last = order ? lastJobForOrder(work.jobs, order) : null;
    if (last?.articleId && articles.byId.has(last.articleId)) {
      setArticleId(last.articleId);
      goConfirm(order, last.articleId);
    } else {
      setTyping(false);
      setStep('article');
    }
  };

  const chooseArticle = (id: string | null) => {
    setArticleId(id);
    goConfirm(orderNo, id);
  };

  const onArticleScan = async (code: string) => {
    setError(null);
    const found = articles.articles.find((a) => a.number === code);
    if (found) return chooseArticle(found.id);
    try {
      const created = await mutate((r) => r.articles.create({ number: code, name: '', description: '' }));
      chooseArticle(created.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const start = async () => {
    if (starting) return;
    setStarting(true);
    try {
      await mutate((r) => r.jobs.start({ orderNo, articleId, quantity: parseQuantity(quantity) }));
      router.back();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setStarting(false);
    }
  };

  const article = articleId ? articles.byId.get(articleId) : undefined;
  const orderMatches = typedOrder.trim()
    ? knownOrders(work.jobs).filter((o) => o.toLowerCase().includes(typedOrder.trim().toLowerCase())).slice(0, 6)
    : [];

  return (
    <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
      <View style={styles.progress}>
        {(['order', 'article', 'confirm'] as Step[]).map((s, i) => (
          <View
            key={s}
            style={[styles.progressBar, { backgroundColor: i <= ['order', 'article', 'confirm'].indexOf(step) ? p.primary : p.track }]}
          />
        ))}
      </View>

      {step === 'order' && (
        <>
          <Text style={[styles.title, { color: p.text }]}>Auftrag scannen</Text>
          {!typing && <ScannerView key="order" hint="Auftrags-Code scannen" onScan={chooseOrder} />}
          {recentOrders(work.jobs).length > 0 && !typing && (
            <View>
              <SectionTitle>Zuletzt</SectionTitle>
              <View style={styles.chips}>
                {recentOrders(work.jobs).map((o) => (
                  <Chip key={o} label={o} onPress={() => chooseOrder(o)} />
                ))}
              </View>
            </View>
          )}
          {typing ? (
            <View style={{ gap: spacing.sm }}>
              <TextInput
                autoFocus
                value={typedOrder}
                onChangeText={setTypedOrder}
                onSubmitEditing={() => chooseOrder(typedOrder)}
                placeholder="Auftragsnummer"
                placeholderTextColor={p.muted}
                autoCapitalize="characters"
                autoCorrect={false}
                returnKeyType="next"
                accessibilityLabel="Auftragsnummer"
                style={[styles.input, { color: p.text, borderColor: p.border, backgroundColor: p.card }]}
              />
              {orderMatches.length > 0 && (
                <View style={styles.chips}>
                  {orderMatches.map((o) => (
                    <Chip key={o} label={o} onPress={() => chooseOrder(o)} />
                  ))}
                </View>
              )}
              <Button title="Weiter" icon="arrow-forward" onPress={() => chooseOrder(typedOrder)} disabled={!typedOrder.trim()} />
              <Button title="Doch scannen" variant="secondary" icon="scan-outline" onPress={() => setTyping(false)} />
            </View>
          ) : (
            <View style={styles.row}>
              <View style={{ flex: 1 }}>
                <Button title="Eintippen" variant="secondary" icon="keypad-outline" onPress={() => setTyping(true)} />
              </View>
              <View style={{ flex: 1 }}>
                <Button title="Ohne Auftrag" variant="secondary" onPress={() => chooseOrder(null)} />
              </View>
            </View>
          )}
        </>
      )}

      {step === 'article' && (
        <>
          <Text style={[styles.title, { color: p.text }]}>Artikel scannen</Text>
          {orderNo && <Text style={{ color: p.muted }}>Auftrag {orderNo} ist neu – welcher Artikel?</Text>}
          {!typing && <ScannerView key="article" hint="Artikel-Code scannen" onScan={(c) => void onArticleScan(c)} />}
          {frequentArticles(work.jobs).length > 0 && !typing && (
            <View>
              <SectionTitle>Häufig</SectionTitle>
              <View style={styles.chips}>
                {frequentArticles(work.jobs)
                  .map((id) => articles.byId.get(id))
                  .filter((a) => !!a)
                  .map((a) => (
                    <Chip key={a!.id} label={articleLabel(a!)} onPress={() => chooseArticle(a!.id)} />
                  ))}
              </View>
            </View>
          )}
          {typing ? (
            <View style={{ gap: spacing.sm }}>
              <ArticleField
                ref={articleRef}
                articles={articles}
                value={null}
                onChange={(id) => {
                  if (!id) return;
                  picked.current = true;
                  chooseArticle(id);
                }}
                autoFocus
              />
              <Button
                title="Weiter"
                icon="arrow-forward"
                onPress={async () => {
                  picked.current = false;
                  const ok = await articleRef.current?.commit();
                  if (ok && !picked.current) chooseArticle(null);
                }}
              />
              <Button title="Doch scannen" variant="secondary" icon="scan-outline" onPress={() => setTyping(false)} />
            </View>
          ) : (
            <View style={styles.row}>
              <View style={{ flex: 1 }}>
                <Button title="Eintippen" variant="secondary" icon="keypad-outline" onPress={() => setTyping(true)} />
              </View>
              <View style={{ flex: 1 }}>
                <Button title="Ohne Artikel" variant="secondary" onPress={() => chooseArticle(null)} />
              </View>
            </View>
          )}
        </>
      )}

      {step === 'confirm' && (
        <>
          <Text style={[styles.title, { color: p.text }]}>Bereit?</Text>
          <View style={[styles.summary, { backgroundColor: p.card, borderColor: p.border }]}>
            <SummaryRow label="Auftrag" value={orderNo ?? '–'} onEdit={() => setStep('order')} />
            <SummaryRow label="Artikel" value={article ? articleLabel(article) : '–'} onEdit={() => setStep('article')} />
          </View>
          <View style={{ gap: spacing.sm }}>
            <SectionTitle>Stückzahl</SectionTitle>
            <QuantityField value={quantity} onChange={setQuantity} />
            {quantityHint ? <Text style={{ color: p.muted, textAlign: 'center' }}>Vorschlag: {quantityHint}</Text> : null}
          </View>
          <Button title="Start" icon="play" variant="success" size="large" onPress={() => void start()} disabled={starting} />
        </>
      )}

      {error && <Text style={{ color: p.danger }}>{error}</Text>}
    </ScrollView>
  );
}

function SummaryRow({ label, value, onEdit }: { label: string; value: string; onEdit: () => void }) {
  const p = usePalette();
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`${label} ändern`} onPress={onEdit} style={styles.summaryRow}>
      <Text style={{ color: p.muted, width: 70 }}>{label}</Text>
      <Text style={{ color: p.text, fontWeight: '700', fontSize: 17, flex: 1 }} numberOfLines={1}>
        {value}
      </Text>
      <Ionicons name="create-outline" size={18} color={p.primary} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { padding: spacing.lg, gap: spacing.lg, paddingBottom: spacing.xl * 2 },
  progress: { flexDirection: 'row', gap: spacing.sm },
  progressBar: { flex: 1, height: 4, borderRadius: 2 },
  title: { fontSize: 26, fontWeight: '800' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  row: { flexDirection: 'row', gap: spacing.sm },
  input: { borderWidth: 1, borderRadius: radius.md, paddingHorizontal: spacing.md, height: 52, fontSize: 20 },
  summary: { borderWidth: StyleSheet.hairlineWidth, borderRadius: radius.md, paddingHorizontal: spacing.md },
  summaryRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.md },
});
