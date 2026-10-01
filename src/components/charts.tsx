import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, G, Line, Rect, Text as SvgText } from 'react-native-svg';

import { formatDuration, toHours } from '../domain/time';
import { spacing, usePalette } from '../theme';

export interface BarDatum {
  label: string;
  ms: number;
}

/**
 * Säulendiagramm in Stunden. Optional eine gestrichelte Soll-Linie.
 * Antippen einer Säule zeigt den genauen Wert.
 */
export function BarChart({ data, height = 180, targetMs }: { data: BarDatum[]; height?: number; targetMs?: number }) {
  const p = usePalette();
  const [width, setWidth] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);

  const axisW = 28;
  const labelH = 18;
  const topPad = 8;
  const plotH = height - labelH - topPad;
  const maxHours = Math.max(1, ...data.map((d) => toHours(d.ms)), targetMs ? toHours(targetMs) : 0);
  const niceMax = Math.ceil(maxHours);
  const plotW = Math.max(0, width - axisW);
  const slot = data.length > 0 ? plotW / data.length : 0;
  const barW = Math.max(2, Math.min(28, slot * 0.65));
  const labelEvery = Math.ceil(data.length / 12);
  const y = (hours: number) => topPad + plotH - (hours / niceMax) * plotH;

  return (
    <View onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      <View style={styles.tooltipRow}>
        <Text style={{ color: p.muted, fontSize: 13 }}>
          {selected !== null && data[selected]
            ? `${data[selected].label}: ${formatDuration(data[selected].ms)}`
            : 'Säule antippen für Details'}
        </Text>
      </View>
      {width > 0 && (
        <Svg width={width} height={height}>
          {[0, niceMax / 2, niceMax].map((h) => (
            <G key={h}>
              <Line x1={axisW} x2={width} y1={y(h)} y2={y(h)} stroke={p.border} strokeWidth={1} />
              <SvgText x={axisW - 6} y={y(h) + 4} fontSize={10} fill={p.muted} textAnchor="end">
                {`${Number.isInteger(h) ? h : h.toFixed(1)}h`}
              </SvgText>
            </G>
          ))}
          {data.map((d, i) => {
            const hours = toHours(d.ms);
            const x = axisW + i * slot + (slot - barW) / 2;
            const barH = (hours / niceMax) * plotH;
            return (
              <G key={i} onPress={() => setSelected(i === selected ? null : i)}>
                {/* unsichtbare Fläche, damit auch kleine Säulen gut antippbar sind */}
                <Rect x={axisW + i * slot} y={topPad} width={slot} height={plotH} fill="transparent" />
                <Rect
                  x={x}
                  y={topPad + plotH - barH}
                  width={barW}
                  height={Math.max(barH, hours > 0 ? 2 : 0)}
                  rx={Math.min(4, barW / 2)}
                  fill={p.primary}
                  opacity={selected === null || selected === i ? 1 : 0.4}
                />
                {i % labelEvery === 0 && (
                  <SvgText x={x + barW / 2} y={height - 4} fontSize={10} fill={p.muted} textAnchor="middle">
                    {d.label}
                  </SvgText>
                )}
              </G>
            );
          })}
          {targetMs ? (
            <Line
              x1={axisW}
              x2={width}
              y1={y(toHours(targetMs))}
              y2={y(toHours(targetMs))}
              stroke={p.success}
              strokeWidth={1.5}
              strokeDasharray="5,4"
            />
          ) : null}
        </Svg>
      )}
    </View>
  );
}

export interface ShareDatum {
  key: string;
  name: string;
  color: string;
  ms: number;
}

/** Ring-Diagramm mit Gesamtzeit in der Mitte. */
export function DonutChart({ data, size = 160 }: { data: ShareDatum[]; size?: number }) {
  const p = usePalette();
  const stroke = 22;
  const r = (size - stroke) / 2;
  const circumference = 2 * Math.PI * r;
  const total = data.reduce((s, d) => s + d.ms, 0);
  let offset = 0;

  return (
    <View style={{ width: size, height: size, alignSelf: 'center' }}>
      <Svg width={size} height={size}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={p.track} strokeWidth={stroke} fill="none" />
        {total > 0 &&
          data.map((d) => {
            const len = (d.ms / total) * circumference;
            const el = (
              <Circle
                key={d.key}
                cx={size / 2}
                cy={size / 2}
                r={r}
                stroke={d.color}
                strokeWidth={stroke}
                fill="none"
                strokeDasharray={`${len} ${circumference - len}`}
                strokeDashoffset={-offset}
                transform={`rotate(-90 ${size / 2} ${size / 2})`}
              />
            );
            offset += len;
            return el;
          })}
      </Svg>
      <View style={[StyleSheet.absoluteFill, styles.center]}>
        <Text style={{ color: p.text, fontSize: 18, fontWeight: '700' }}>{formatDuration(total)}</Text>
      </View>
    </View>
  );
}

/** Liste mit horizontalen Balken (Name, Dauer, Anteil). */
export function ShareList({ data, total }: { data: ShareDatum[]; total: number }) {
  const p = usePalette();
  return (
    <View style={{ gap: spacing.md }}>
      {data.map((d) => {
        const pct = total > 0 ? d.ms / total : 0;
        return (
          <View key={d.key}>
            <View style={styles.shareHeader}>
              <View style={[styles.dot, { backgroundColor: d.color }]} />
              <Text style={{ color: p.text, flex: 1 }} numberOfLines={1}>
                {d.name}
              </Text>
              <Text style={{ color: p.muted }}>
                {formatDuration(d.ms)} · {Math.round(pct * 100)}%
              </Text>
            </View>
            <View style={[styles.track, { backgroundColor: p.track }]}>
              <View style={{ width: `${Math.min(100, pct * 100)}%`, backgroundColor: d.color, height: '100%', borderRadius: 3 }} />
            </View>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  tooltipRow: { minHeight: 20, marginBottom: spacing.xs },
  center: { alignItems: 'center', justifyContent: 'center' },
  shareHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: 4 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  track: { height: 6, borderRadius: 3, overflow: 'hidden' },
});
