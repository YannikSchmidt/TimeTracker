import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { QuantityField, parseQuantity } from '../components/EntryFields';
import { ScannerView } from '../components/ScannerView';
import { Button, Card, Chip, SectionTitle } from '../components/ui';
import { useData } from '../data/DataProvider';
import { classifyCode, CODE_KIND_LABEL, isArticleKind, looksLikeNumber, type CodeKind } from '../domain/codes';
import { suggestQuantity } from '../domain/quantity';
import { frequentArticles, knownOrders, lastJobForOrder, recentOrders } from '../domain/suggestions';
import type { Article } from '../domain/types';
import { articleLabel, findArticleByName, matchArticles, useArticles } from '../hooks/useArticles';
import { useWork } from '../hooks/useWork';
import { radius, spacing, usePalette } from '../theme';

type Phase = 'scan' | 'ask' | 'confirm';

/** Rückfrage zu einer Eingabe, die nicht eindeutig ist */
type Question =
  | { type: 'which'; code: string } // Auftrag oder Artikel?
  | { type: 'newNumber'; code: string } // getippte Artikelnummer unbekannt → vertippt?
  | { type: 'nameOnly'; name: string }; // unbekannte Bezeichnung → nur mit Bezeichnung anlegen?

/**
 * Neuer Auftrag, so schnell wie möglich: Codes in beliebiger Reihenfolge scannen – die App erkennt am Aufbau,
 * ob es ein Auftrag (25/26/27…) oder ein Artikel (07… Gesamtgerät, 500000… Front) ist – und fragt dann,
 * ob die nächste Nummer gescannt werden soll. Ist der Auftrag schon bekannt, wird der Artikel übernommen.
 */
export default function StartScreen() {
  const p = usePalette();
  const { mutate } = useData();
  const work = useWork();
  const articles = useArticles();
  const patterns = work.settings.codePatterns;

  const [phase, setPhase] = useState<Phase>('scan');
  const [orderNo, setOrderNo] = useState<string | null>(null);
  const [articleId, setArticleId] = useState<string | null>(null);
  /** „Ohne Auftrag“ bzw. „Ohne Artikel“ gewählt */
  const [skipOrder, setSkipOrder] = useState(false);
  const [skipArticle, setSkipArticle] = useState(false);
  const [quantity, setQuantity] = useState('');
  const [quantityHint, setQuantityHint] = useState('');
  const [typing, setTyping] = useState(false);
  const [typed, setTyped] = useState('');
  const [question, setQuestion] = useState<Question | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  /** wechselt bei jedem neuen Scan-Schritt → Scanner startet neu */
  const [scanRound, setScanRound] = useState(0);

  const article = articleId ? articles.byId.get(articleId) : undefined;
  const needOrder = !orderNo && !skipOrder;
  const needArticle = !articleId && !skipArticle;

  const goConfirm = (order: string | null, article: string | null) => {
    const last = order ? lastJobForOrder(work.all.jobs, order) : null;
    if (last?.quantity != null && last.articleId === article) {
      setQuantity(String(last.quantity));
      setQuantityHint(`wie beim letzten Mal bei Auftrag ${order}`);
    } else {
      const s = suggestQuantity(work.all.jobs, article, work.settings.defaultQuantity);
      setQuantity(String(s.quantity));
      setQuantityHint(s.source === 'history' ? 'häufigste Stückzahl dieses Artikels' : 'Standard-Stückzahl');
    }
    setTyping(false);
    setPhase('confirm');
  };

  /** Nach jeder Eingabe: fertig → Bestätigung, sonst fragen, ob die nächste Nummer gescannt werden soll. */
  const advance = (next: { order: string | null; article: string | null; skipOrder: boolean; skipArticle: boolean }) => {
    setTyping(false);
    setTyped('');
    setQuestion(null);
    const missingOrder = !next.order && !next.skipOrder;
    const missingArticle = !next.article && !next.skipArticle;
    if (!missingOrder && !missingArticle) return goConfirm(next.order, next.article);
    setPhase('ask');
  };

  const state = () => ({ order: orderNo, article: articleId, skipOrder, skipArticle });

  const applyOrder = (value: string) => {
    const order = value.trim();
    setOrderNo(order);
    setSkipOrder(false);
    // Bekannter Auftrag → Artikel übernehmen
    const last = lastJobForOrder(work.all.jobs, order);
    let article = articleId;
    if (!article && last?.articleId && articles.byId.has(last.articleId)) {
      article = last.articleId;
      setArticleId(article);
    }
    advance({ ...state(), order, article, skipOrder: false });
  };

  const applyArticle = (id: string) => {
    setArticleId(id);
    setSkipArticle(false);
    advance({ ...state(), article: id, skipArticle: false });
  };

  const createArticle = async (number: string, name = '') => {
    try {
      const created = await mutate((r) => r.articles.create({ number, name, device: '' }));
      applyArticle(created.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const findByNumber = (number: string): Article | undefined =>
    number ? articles.articles.find((a) => a.number === number) : undefined;

  /** Eine Nummer übernehmen – Art aus dem Aufbau, sonst aus der Liste, sonst nachfragen. */
  const handleCode = (raw: string, source: 'scan' | 'typed'): boolean => {
    const code = raw.trim();
    setError(null);
    setNotice(null);
    if (!code) return false;
    if (code === orderNo || (article && code === article.number)) {
      setNotice(`${code} ist schon erfasst – bitte den anderen Code scannen.`);
      return false;
    }
    const known = findByNumber(code);
    const kind: CodeKind = known ? 'device' : classifyCode(code, patterns);
    if (kind === 'order') {
      applyOrder(code);
    } else if (isArticleKind(kind)) {
      if (known) applyArticle(known.id);
      else if (source === 'scan') void createArticle(code); // gescannt → sicher richtig, direkt anlegen
      else setQuestion({ type: 'newNumber', code });
    } else if (knownOrders(work.all.jobs).includes(code)) {
      applyOrder(code);
    } else if (source === 'typed' && !looksLikeNumber(code)) {
      const byName = findArticleByName(articles.articles, code);
      if (byName) applyArticle(byName.id);
      else setQuestion({ type: 'nameOnly', name: code });
    } else {
      setQuestion({ type: 'which', code });
    }
    return true;
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

  const scanAgain = () => {
    setScanRound((n) => n + 1);
    setNotice(null);
    setPhase('scan');
  };

  const skip = (what: 'order' | 'article') => {
    if (what === 'order') setSkipOrder(true);
    else setSkipArticle(true);
    advance({ ...state(), ...(what === 'order' ? { skipOrder: true } : { skipArticle: true }) });
  };

  const edit = (what: 'order' | 'article') => {
    if (what === 'order') {
      setOrderNo(null);
      setSkipOrder(false);
    } else {
      setArticleId(null);
      setSkipArticle(false);
    }
    scanAgain();
  };

  const wanted = needOrder && needArticle ? 'Auftrag oder Artikel' : needOrder ? 'Auftrag' : 'Artikel';
  const q = typed.trim().toLowerCase();
  const orderMatches = q && needOrder ? knownOrders(work.all.jobs).filter((o) => o.toLowerCase().includes(q)).slice(0, 4) : [];
  const articleMatches = q && needArticle ? matchArticles(articles.articles, typed, 5) : [];

  const done = (
    <View style={[styles.summary, { backgroundColor: p.card, borderColor: p.border }]}>
      <SummaryRow label="Auftrag" value={orderNo ?? (skipOrder ? 'ohne' : '–')} ok={!!orderNo} onEdit={phase === 'confirm' ? () => edit('order') : undefined} />
      <SummaryRow
        label="Artikel"
        value={article ? articleLabel(article) : skipArticle ? 'ohne' : '–'}
        ok={!!article}
        onEdit={phase === 'confirm' ? () => edit('article') : undefined}
      />
    </View>
  );

  return (
    <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
      {phase === 'scan' && (
        <>
          <Text style={[styles.title, { color: p.text }]}>{wanted} scannen</Text>
          {(orderNo || article || skipOrder || skipArticle) && done}
          {!typing && !question && <ScannerView key={`scan-${scanRound}`} hint={`${wanted} scannen`} onScan={(c) => handleCode(c, 'scan')} />}

          {!typing && !question && needOrder && recentOrders(work.all.jobs).length > 0 && (
            <View>
              <SectionTitle>Zuletzt</SectionTitle>
              <View style={styles.chips}>
                {recentOrders(work.all.jobs).map((o) => (
                  <Chip key={o} label={o} onPress={() => applyOrder(o)} />
                ))}
              </View>
            </View>
          )}
          {!typing && !question && needArticle && frequentArticles(work.all.jobs).length > 0 && (
            <View>
              <SectionTitle>Häufige Artikel</SectionTitle>
              <View style={styles.chips}>
                {frequentArticles(work.all.jobs)
                  .map((id) => articles.byId.get(id))
                  .filter((a): a is Article => !!a)
                  .map((a) => (
                    <Chip key={a.id} label={a.name || a.number} onPress={() => applyArticle(a.id)} />
                  ))}
              </View>
            </View>
          )}

          {question ? (
            <QuestionCard
              question={question}
              onOrder={(c) => applyOrder(c)}
              onArticleNumber={(c) => {
                const known = findByNumber(c);
                if (known) applyArticle(known.id);
                else void createArticle(c);
              }}
              onNameOnly={(name) => void createArticle('', name)}
              onCancel={() => setQuestion(null)}
            />
          ) : typing ? (
            <View style={{ gap: spacing.sm }}>
              <TextInput
                autoFocus
                value={typed}
                onChangeText={(t) => {
                  setTyped(t);
                  setNotice(null);
                }}
                onSubmitEditing={() => handleCode(typed, 'typed')}
                placeholder={needOrder && needArticle ? 'Auftrag, Artikelnummer oder Bezeichnung' : needOrder ? 'Auftragsnummer' : 'Artikelnummer oder Bezeichnung'}
                placeholderTextColor={p.muted}
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="next"
                accessibilityLabel="Nummer oder Bezeichnung"
                style={[styles.input, { color: p.text, borderColor: p.border, backgroundColor: p.card }]}
              />
              {(orderMatches.length > 0 || articleMatches.length > 0) && (
                <View style={[styles.suggestions, { borderColor: p.border, backgroundColor: p.card }]}>
                  {orderMatches.map((o) => (
                    <Suggestion key={`o-${o}`} title={o} subtitle="Auftrag" onPress={() => applyOrder(o)} />
                  ))}
                  {articleMatches.map((a) => (
                    <Suggestion
                      key={a.id}
                      title={a.name || a.number}
                      subtitle={['Artikel', a.name ? a.number : '', a.device].filter(Boolean).join(' · ')}
                      onPress={() => applyArticle(a.id)}
                    />
                  ))}
                </View>
              )}
              <Button title="Weiter" icon="arrow-forward" onPress={() => handleCode(typed, 'typed')} disabled={!typed.trim()} />
              <Button title="Doch scannen" variant="secondary" icon="scan-outline" onPress={() => setTyping(false)} />
            </View>
          ) : (
            <View style={styles.row}>
              <View style={{ flex: 1 }}>
                <Button title="Eintippen" variant="secondary" icon="keypad-outline" onPress={() => setTyping(true)} />
              </View>
              {needOrder && (
                <View style={{ flex: 1 }}>
                  <Button title="Ohne Auftrag" variant="secondary" onPress={() => skip('order')} />
                </View>
              )}
              {!needOrder && needArticle && (
                <View style={{ flex: 1 }}>
                  <Button title="Ohne Artikel" variant="secondary" onPress={() => skip('article')} />
                </View>
              )}
            </View>
          )}
        </>
      )}

      {phase === 'ask' && (
        <>
          <Text style={[styles.title, { color: p.text }]}>Erkannt</Text>
          {done}
          <Card style={{ gap: spacing.md }}>
            <Text style={{ color: p.text, fontSize: 18, fontWeight: '700' }}>
              {needOrder ? 'Auftrag auch scannen?' : 'Artikel auch scannen?'}
            </Text>
            <Button
              title={needOrder ? 'Auftrag scannen' : 'Artikel scannen'}
              icon="scan-outline"
              size="large"
              onPress={scanAgain}
            />
            <Button
              title={needOrder ? 'Ohne Auftrag weiter' : 'Ohne Artikel weiter'}
              variant="secondary"
              onPress={() => skip(needOrder ? 'order' : 'article')}
            />
          </Card>
        </>
      )}

      {phase === 'confirm' && (
        <>
          <Text style={[styles.title, { color: p.text }]}>Bereit?</Text>
          {done}
          <View style={{ gap: spacing.sm }}>
            <SectionTitle>Stückzahl</SectionTitle>
            <QuantityField value={quantity} onChange={setQuantity} />
            {quantityHint ? <Text style={{ color: p.muted, textAlign: 'center' }}>Vorschlag: {quantityHint}</Text> : null}
          </View>
          <Button title="Start" icon="play" variant="success" size="large" onPress={() => void start()} disabled={starting} />
        </>
      )}

      {notice && <Text style={{ color: p.warning }}>{notice}</Text>}
      {error && <Text style={{ color: p.danger }}>{error}</Text>}
    </ScrollView>
  );
}

function QuestionCard({
  question,
  onOrder,
  onArticleNumber,
  onNameOnly,
  onCancel,
}: {
  question: Question;
  onOrder: (code: string) => void;
  onArticleNumber: (code: string) => void;
  onNameOnly: (name: string) => void;
  onCancel: () => void;
}) {
  const p = usePalette();
  const warn = { borderColor: p.warning, backgroundColor: p.warning + '14' };
  if (question.type === 'which') {
    return (
      <View style={[styles.question, warn]}>
        <Text style={{ color: p.text }}>
          <Text style={{ fontWeight: '700' }}>{question.code}</Text> passt zu keinem bekannten Nummernformat. Was ist es?
        </Text>
        <View style={styles.row}>
          <View style={{ flex: 1 }}>
            <Button title={CODE_KIND_LABEL.order} onPress={() => onOrder(question.code)} />
          </View>
          <View style={{ flex: 1 }}>
            <Button title="Artikel" onPress={() => onArticleNumber(question.code)} />
          </View>
        </View>
        <Button title="Abbrechen" variant="secondary" onPress={onCancel} />
      </View>
    );
  }
  if (question.type === 'newNumber') {
    return (
      <View style={[styles.question, warn]}>
        <Text style={{ color: p.text }}>
          Artikel <Text style={{ fontWeight: '700' }}>{question.code}</Text> ist nicht in der Liste. Vertippt?
        </Text>
        <View style={styles.row}>
          <View style={{ flex: 1 }}>
            <Button title="Korrigieren" variant="secondary" onPress={onCancel} />
          </View>
          <View style={{ flex: 1 }}>
            <Button title="Neu anlegen" icon="add" onPress={() => onArticleNumber(question.code)} />
          </View>
        </View>
      </View>
    );
  }
  return (
    <View style={[styles.question, warn]}>
      <Text style={{ color: p.text }}>
        Keinen Artikel „<Text style={{ fontWeight: '700' }}>{question.name}</Text>“ gefunden. Nur mit Bezeichnung anlegen (ohne
        Artikelnummer)?
      </Text>
      <View style={styles.row}>
        <View style={{ flex: 1 }}>
          <Button title="Korrigieren" variant="secondary" onPress={onCancel} />
        </View>
        <View style={{ flex: 1 }}>
          <Button title="Anlegen" icon="add" onPress={() => onNameOnly(question.name)} />
        </View>
      </View>
    </View>
  );
}

function Suggestion({ title, subtitle, onPress }: { title: string; subtitle: string; onPress: () => void }) {
  const p = usePalette();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.suggestion, { backgroundColor: pressed ? p.track : 'transparent' }]}
    >
      <Text style={{ color: p.text, fontWeight: '600' }} numberOfLines={1}>
        {title}
      </Text>
      <Text style={{ color: p.muted, fontSize: 13 }} numberOfLines={1}>
        {subtitle}
      </Text>
    </Pressable>
  );
}

function SummaryRow({ label, value, ok, onEdit }: { label: string; value: string; ok: boolean; onEdit?: () => void }) {
  const p = usePalette();
  const content = (
    <>
      <Ionicons name={ok ? 'checkmark-circle' : 'ellipse-outline'} size={20} color={ok ? p.success : p.muted} />
      <Text style={{ color: p.muted, width: 62 }}>{label}</Text>
      <Text style={{ color: p.text, fontWeight: '700', fontSize: 17, flex: 1 }} numberOfLines={1}>
        {value}
      </Text>
      {onEdit && <Ionicons name="create-outline" size={18} color={p.primary} />}
    </>
  );
  return onEdit ? (
    <Pressable accessibilityRole="button" accessibilityLabel={`${label} ändern`} onPress={onEdit} style={styles.summaryRow}>
      {content}
    </Pressable>
  ) : (
    <View style={styles.summaryRow}>{content}</View>
  );
}

const styles = StyleSheet.create({
  container: { padding: spacing.lg, gap: spacing.lg, paddingBottom: spacing.xl * 2 },
  title: { fontSize: 26, fontWeight: '800' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  row: { flexDirection: 'row', gap: spacing.sm },
  input: { borderWidth: 1, borderRadius: radius.md, paddingHorizontal: spacing.md, height: 52, fontSize: 20 },
  summary: { borderWidth: StyleSheet.hairlineWidth, borderRadius: radius.md, paddingHorizontal: spacing.md },
  summaryRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.md },
  suggestions: { borderWidth: 1, borderRadius: radius.md, overflow: 'hidden' },
  suggestion: { gap: 2, paddingHorizontal: spacing.md, paddingVertical: spacing.sm + 2 },
  question: { borderWidth: 1, borderRadius: radius.md, padding: spacing.md, gap: spacing.md },
});
