import { useEffect, useMemo, useState } from 'react';
import {
  ArrowDownToLine,
  ArrowUpRight,
  Building2,
  CalendarDays,
  ChevronRight,
  CircleHelp,
  Database,
  FileText,
  Home,
  Landmark,
  LayoutDashboard,
  MapPin,
  RefreshCw,
  ShieldCheck,
  TrendingUp,
} from 'lucide-react';
import { api, dateLabel, monthLabel, number } from './api.ts';
import type {
  Metric,
  Observation,
  Region,
  Summary,
  SyncLog,
  SyncStatus,
  ValueStat,
} from './api.ts';
import { Chart } from './Chart.tsx';

const statusNames: Record<string, string> = {
  SUCCESS: 'Успешно',
  PARTIAL: 'Частично',
  FAILED: 'Ошибка',
  RUNNING: 'Обновление',
};
function Delta({ value, label = 'к прошлому месяцу' }: { value: number | null; label?: string }) {
  return (
    <div className="delta-row">
      <span className={`delta ${value !== null && value < 0 ? 'down' : ''}`}>
        {value === null ? 'Нет сравнения' : `${value > 0 ? '+' : ''}${number(value)} %`}
      </span>
      <span>{label}</span>
    </div>
  );
}
function Card({
  title,
  stat,
  divisor = 1,
  unit,
  icon,
  digits = 1,
}: {
  title: string;
  stat: ValueStat;
  divisor?: number;
  unit: string;
  icon: React.ReactNode;
  digits?: number;
}) {
  return (
    <article className="metric-card">
      <div className="metric-top">
        <span>{title}</span>
        <span className="metric-icon">{icon}</span>
      </div>
      <div className="metric-value">
        {number(stat.value === null ? null : stat.value / divisor, digits)} <small>{unit}</small>
      </div>
      <Delta value={stat.mom} />
    </article>
  );
}

export function App() {
  const [regions, setRegions] = useState<Region[]>([]);
  const [region, setRegion] = useState('CBR-22');
  const [period, setPeriod] = useState('');
  const [summary, setSummary] = useState<Summary | null>(null);
  const [observations, setObservations] = useState<Observation[]>([]);
  const [status, setStatus] = useState<SyncStatus | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [reload, setReload] = useState(0);
  const [windowSize, setWindowSize] = useState(12);
  const [activeNav, setActiveNav] = useState('overview');

  useEffect(() => {
    const controller = new AbortController();
    api<Region[]>('/api/v1/regions', { signal: controller.signal })
      .then((data) => {
        setRegions(data);
        if (data.length)
          setRegion((current) => (data.some((r) => r.code === current) ? current : data[0]!.code));
      })
      .catch((e: Error) => {
        if (!controller.signal.aborted) setError(e.message);
      });
    return () => controller.abort();
    // Region catalogue is refreshed after import, independently of filters.
  }, [reload]);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError('');
    async function load() {
      const next = await api<Summary>(
        `/api/v1/mortgage/summary?region=${region}${period ? `&period=${period}` : ''}`,
        { signal: controller.signal },
      );
      const months = next.availablePeriods
        .filter((p) => p <= next.period)
        .slice(0, windowSize || undefined);
      const stats = await api<{ observations: Observation[] }>(
        `/api/v1/mortgage/stats?region=${region}&from=${months.at(-1) ?? next.period}&to=${next.period}`,
        { signal: controller.signal },
      );
      if (!controller.signal.aborted) {
        setSummary(next);
        setObservations(stats.observations);
      }
    }
    void load()
      .catch((e: Error) => {
        if (!controller.signal.aborted) {
          setSummary(null);
          setObservations([]);
          setError(e.message);
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [region, period, reload, windowSize]);

  useEffect(() => {
    const controller = new AbortController();
    const refresh = () => {
      void api<SyncStatus>('/api/v1/sync/status', { signal: controller.signal })
        .then(setStatus)
        .catch(() => {});
    };
    refresh();
    const timer = setInterval(refresh, 15000);
    return () => {
      controller.abort();
      clearInterval(timer);
    };
  }, [reload]);

  const table = useMemo(() => {
    const rows = new Map<string, Partial<Record<Metric, number>>>();
    for (const observation of observations) {
      const row = rows.get(observation.period) ?? {};
      row[observation.metric] = observation.value;
      rows.set(observation.period, row);
    }
    return [...rows.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [observations]);

  async function synchronize() {
    setSyncing(true);
    setError('');
    setNotice('');
    try {
      const result = await api<SyncLog>('/api/v1/sync/run', {
        method: 'POST',
        signal: AbortSignal.timeout(180000),
      });
      setNotice(
        `Обновление завершено: добавлено ${result.recordsInserted}, изменено ${result.recordsUpdated}, пропущено ${result.recordsSkipped}.${result.status === 'PARTIAL' ? ' Часть рядов недоступна — подробности в блоке источника.' : ''}`,
      );
      setReload((n) => n + 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось обновить данные');
    } finally {
      setSyncing(false);
    }
  }

  function exportCsv() {
    const fields: Metric[] = [
      'MORTGAGE_VOLUME',
      'MORTGAGE_COUNT',
      'AVERAGE_RATE',
      'AVERAGE_TERM',
      'DEBT',
      'OVERDUE_DEBT',
    ];
    const lines = [
      'Регион;Месяц;Объём RUB;Количество;Ставка % годовых;Срок месяцев;Долг RUB;Просрочка RUB',
      ...table.map(([month, row]) =>
        [
          summary?.region.name ?? region,
          month,
          ...fields.map((metric) => row[metric]?.toString().replace('.', ',') ?? ''),
        ].join(';'),
      ),
    ];
    const url = URL.createObjectURL(
      new Blob(['\uFEFF' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' }),
    );
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `mortgage-${region}-${summary?.period ?? 'data'}.csv`;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  const m = summary?.metrics;
  const busy = syncing || !!status?.running;
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a className="brand" href="#overview">
          <span className="brand-icon">
            <Home size={23} />
          </span>
          <span>
            Своё Жильё<small>АНАЛИТИКА РЫНКА</small>
          </span>
        </a>
        <div className="workspace-label">Рабочее пространство</div>
        <nav>
          {[
            { id: 'overview', label: 'Обзор рынка', icon: <LayoutDashboard size={18} /> },
            { id: 'dynamics', label: 'Динамика показателей', icon: <TrendingUp size={18} /> },
            { id: 'table', label: 'Данные по месяцам', icon: <FileText size={18} /> },
            { id: 'sources', label: 'Источники данных', icon: <Database size={18} /> },
          ].map((item) => (
            <a
              key={item.id}
              className={activeNav === item.id ? 'active' : ''}
              href={`#${item.id}`}
              onClick={() => setActiveNav(item.id)}
            >
              {item.icon}
              {item.label}
              {activeNav === item.id && <ChevronRight size={15} />}
            </a>
          ))}
        </nav>
        <div className="sidebar-note">
          <span className="live-dot" />
          Официальная статистика
          <p>
            Данные Банка России.
            <br />
            Ежедневная проверка обновлений.
          </p>
        </div>
        <div className="sidebar-bottom">
          <Landmark size={20} />
          <span>
            Россельхозбанк<small>Конкурсный MVP</small>
          </span>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumbs">
            Аналитика <ChevronRight size={14} />
            <strong>Ипотечное кредитование</strong>
          </div>
          <div className="topbar-end">
            <span className="source-pill">
              <span className="live-dot" />
              Банк России
            </span>
            <span className="avatar">СЖ</span>
          </div>
        </header>
        <main>
          <section id="overview" className="page-heading">
            <div>
              <div className="eyebrow">РЫНОК НЕДВИЖИМОСТИ</div>
              <h1>Ипотечное кредитование</h1>
              <p>Рынок в цифрах — для взвешенных решений.</p>
            </div>
            <button className="primary-button" onClick={() => void synchronize()} disabled={busy}>
              <RefreshCw size={16} className={busy ? 'spin' : ''} />
              {busy ? 'Обновляем данные…' : 'Обновить данные сейчас'}
            </button>
          </section>
          <div className="filter-panel">
            <div className="filters">
              <label>
                <MapPin size={17} />
                <span>
                  Регион
                  <select
                    aria-label="Регион"
                    value={region}
                    onChange={(e) => {
                      setRegion(e.target.value);
                      setPeriod('');
                    }}
                  >
                    {regions.length ? (
                      regions.map((r) => (
                        <option key={r.code} value={r.code}>
                          {r.name}
                        </option>
                      ))
                    ) : (
                      <option value="CBR-22">Российская Федерация</option>
                    )}
                  </select>
                </span>
              </label>
              <div className="filter-divider" />
              <label>
                <CalendarDays size={17} />
                <span>
                  Отчётный месяц
                  <select
                    aria-label="Отчётный месяц"
                    value={period || summary?.period || ''}
                    onChange={(e) => setPeriod(e.target.value)}
                  >
                    {summary?.availablePeriods.map((p) => (
                      <option key={p} value={p}>
                        {monthLabel(p)}
                      </option>
                    )) ?? <option value="">Нет данных</option>}
                  </select>
                </span>
              </label>
            </div>
            <span className="currency-tag">
              Выдачи в рублях <span>₽</span>
            </span>
          </div>
          {error && (
            <div className="alert error" role="alert">
              {error}
              {!summary && <span> Запустите обновление для получения доступных данных.</span>}
            </div>
          )}
          {notice && (
            <div className="alert success" role="status">
              {notice}
            </div>
          )}
          <div className="section-heading">
            <h2>Ключевые показатели</h2>
            <span>
              {summary ? monthLabel(summary.period) : 'Данные источника'}{' '}
              <span className="separator">/</span> {summary?.region.name ?? 'Загрузка'}
            </span>
          </div>
          {loading ? (
            <div className="metrics-grid" aria-label="Загрузка данных">
              {Array.from({ length: 6 }, (_, i) => (
                <div className="metric-card skeleton" key={i} />
              ))}
            </div>
          ) : m && summary ? (
            <>
              <div className="metrics-grid">
                <Card
                  title="Объём выдач"
                  stat={m.MORTGAGE_VOLUME}
                  divisor={1e9}
                  unit="млрд ₽"
                  icon={<Building2 size={18} />}
                />
                <Card
                  title="Количество кредитов"
                  stat={m.MORTGAGE_COUNT}
                  unit="шт."
                  digits={0}
                  icon={<FileText size={18} />}
                />
                <Card
                  title="Средняя ставка"
                  stat={m.AVERAGE_RATE}
                  unit="%"
                  digits={2}
                  icon={<span>%</span>}
                />
                <Card
                  title="Средний срок"
                  stat={m.AVERAGE_TERM}
                  divisor={12}
                  unit="лет"
                  icon={<CalendarDays size={18} />}
                />
                <Card
                  title="Средний размер кредита"
                  stat={summary.averageLoanSize}
                  divisor={1e6}
                  unit="млн ₽"
                  digits={2}
                  icon={<Home size={18} />}
                />
                <article className="metric-card highlight">
                  <div className="metric-top">
                    <span>Динамика объёма выдач</span>
                    <TrendingUp size={19} />
                  </div>
                  <div className="metric-value">
                    {m.MORTGAGE_VOLUME.mom === null
                      ? '—'
                      : `${m.MORTGAGE_VOLUME.mom > 0 ? '+' : ''}${number(m.MORTGAGE_VOLUME.mom)}`}{' '}
                    <small>%</small>
                  </div>
                  <div className="highlight-footer">
                    к предыдущему месяцу
                    <span>
                      Год к году:{' '}
                      {m.MORTGAGE_VOLUME.yoy === null
                        ? '—'
                        : `${m.MORTGAGE_VOLUME.yoy > 0 ? '+' : ''}${number(m.MORTGAGE_VOLUME.yoy)} %`}
                    </span>
                  </div>
                </article>
              </div>
              <div className="debt-strip">
                <span>
                  Кредитный портфель{' '}
                  <strong>
                    {number(m.DEBT.value === null ? null : m.DEBT.value / 1e12, 2)} трлн ₽
                  </strong>
                </span>
                <i />
                <span>
                  Просроченная задолженность{' '}
                  <strong>
                    {number(m.OVERDUE_DEBT.value === null ? null : m.OVERDUE_DEBT.value / 1e9, 1)}{' '}
                    млрд ₽
                  </strong>
                </span>
                <span className="stock-note">
                  <CircleHelp size={14} /> На начало следующего месяца
                </span>
              </div>
            </>
          ) : (
            <div className="empty-state">
              <Database size={30} />
              <h3>Данные ещё не загружены</h3>
              <p>Получите официальную статистику кнопкой обновления.</p>
            </div>
          )}
          <section id="dynamics">
            <div className="section-heading">
              <h2>
                Динамика рынка <span className="subtle">/ {table.length} мес.</span>
              </h2>
              <div className="segmented">
                <button
                  className={windowSize === 12 ? 'selected' : ''}
                  onClick={() => setWindowSize(12)}
                >
                  12 месяцев
                </button>
                <button
                  className={windowSize === 0 ? 'selected' : ''}
                  onClick={() => setWindowSize(0)}
                >
                  Весь период
                </button>
              </div>
            </div>
            <div className="charts-grid">
              {[
                {
                  metric: 'MORTGAGE_VOLUME' as const,
                  title: 'Объём ипотечных выдач',
                  suffix: 'млрд ₽',
                  divisor: 1e9,
                  color: '#25816b',
                  bars: true,
                },
                {
                  metric: 'MORTGAGE_COUNT' as const,
                  title: 'Количество кредитов',
                  suffix: 'тыс. шт.',
                  divisor: 1000,
                  color: '#6d8bcb',
                },
                {
                  metric: 'AVERAGE_RATE' as const,
                  title: 'Средневзвешенная ставка',
                  suffix: '% годовых',
                  divisor: 1,
                  color: '#be9361',
                },
              ].map((chart) => (
                <article className="chart-card" key={chart.metric}>
                  <h3>{chart.title}</h3>
                  <div className="chart-subtitle">
                    <span className="chart-dot" style={{ background: chart.color }} />
                    {chart.suffix}
                    <span>
                      {table[0] && monthLabel(table[0][0], true)} —{' '}
                      {table.at(-1) && monthLabel(table.at(-1)![0], true)}
                    </span>
                  </div>
                  <Chart
                    labels={table.map(([p]) => p)}
                    values={table.map(([, row]) =>
                      row[chart.metric] === undefined ? null : row[chart.metric]! / chart.divisor,
                    )}
                    color={chart.color}
                    bars={chart.bars}
                    suffix={chart.suffix}
                  />
                </article>
              ))}
            </div>
          </section>
          <section id="table" className="table-panel">
            <div className="section-heading">
              <div>
                <h2>Данные по месяцам</h2>
                <p>Все показатели — по выбранному региону, выдачи в рублях</p>
              </div>
              <button className="secondary-button" onClick={exportCsv} disabled={!table.length}>
                <ArrowDownToLine size={15} />
                Скачать CSV
              </button>
            </div>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Период</th>
                    <th>Объём, млрд ₽</th>
                    <th>Кредиты, шт.</th>
                    <th>Ставка, %</th>
                    <th>Срок, мес.</th>
                    <th>Средний кредит, млн ₽</th>
                  </tr>
                </thead>
                <tbody>
                  {[...table].reverse().map(([month, row]) => (
                    <tr key={month}>
                      <td>{monthLabel(month)}</td>
                      <td>
                        {number(
                          row.MORTGAGE_VOLUME === undefined ? null : row.MORTGAGE_VOLUME / 1e9,
                          2,
                        )}
                      </td>
                      <td>{number(row.MORTGAGE_COUNT, 0)}</td>
                      <td>{number(row.AVERAGE_RATE, 2)}</td>
                      <td>{number(row.AVERAGE_TERM, 1)}</td>
                      <td>
                        {number(
                          row.MORTGAGE_COUNT && row.MORTGAGE_VOLUME !== undefined
                            ? row.MORTGAGE_VOLUME / row.MORTGAGE_COUNT / 1e6
                            : null,
                          2,
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!table.length && <div className="chart-empty">Нет строк для выбранных фильтров</div>}
            </div>
          </section>
          <section id="sources" className="source-panel">
            <div className="source-main">
              <span className="source-icon">
                <ShieldCheck size={23} />
              </span>
              <div>
                <h3>Данные, которым можно доверять</h3>
                <p>
                  Источник: Банк России · Data Service API · Данные за месяц, без сезонной
                  корректировки
                </p>
              </div>
            </div>
            <div className="source-metadata">
              <div>
                Обновление источника<strong>{dateLabel(summary?.sourceUpdatedAt)}</strong>
              </div>
              <div>
                Проверка данных<strong>{dateLabel(status?.latest?.finishedAt)}</strong>
              </div>
              <span className={`sync-badge ${status?.latest?.status === 'FAILED' ? 'failed' : ''}`}>
                <span className="live-dot" />
                {statusNames[status?.latest?.status ?? ''] ?? 'Не запускалась'}
              </span>
            </div>
            {!!status?.latest?.issues?.length && (
              <details>
                <summary>Замечания синхронизации ({status.latest.issues.length})</summary>
                <ul>
                  {status.latest.issues.slice(0, 30).map((issue, i) => (
                    <li key={i}>{issue}</li>
                  ))}
                </ul>
              </details>
            )}
            {status?.latest?.errorMessage && (
              <p className="source-error">{status.latest.errorMessage}</p>
            )}
          </section>
          <footer>
            <span>Своё Жильё · Аналитика ипотечного рынка</span>
            <a href="/docs" target="_blank" rel="noreferrer">
              Документация API <ArrowUpRight size={13} />
            </a>
          </footer>
        </main>
      </div>
    </div>
  );
}
