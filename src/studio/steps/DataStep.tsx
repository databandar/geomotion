import { useEffect, useMemo, useState } from 'react';
import { api, type Extracted, type StudioScript } from '../api';
import { slugify } from '../defaults';

export function DataStep({
  script,
  patch,
  data,
  setData,
  run,
  busy,
}: {
  script: StudioScript;
  patch: (p: Partial<StudioScript>) => void;
  data: Extracted | null;
  setData: (d: Extracted | null) => void;
  run: (label: string, fn: () => Promise<void>) => Promise<void>;
  busy: string | null;
}) {
  const [indicators, setIndicators] = useState<string[]>([]);
  const [filter, setFilter] = useState('');

  useEffect(() => {
    api.indicators().then((r) => setIndicators(r.indicators)).catch(() => setIndicators([]));
  }, []);

  const shown = useMemo(() => {
    const f = filter.trim().toLowerCase();
    return indicators.filter((i) => i.toLowerCase().includes(f)).slice(0, 60);
  }, [indicators, filter]);

  const current = typeof script.values === 'object' && script.values && 'nfhs' in script.values
    ? (script.values as { nfhs: string }).nfhs
    : '';

  const pick = (indicator: string) =>
    run('Loading data', async () => {
      const e = await api.extract(indicator, 'total');
      setData(e);
      // A shorter legend label than the full survey wording, which is unusable
      // on screen; the metric label keeps the fuller version.
      const short = indicator.replace(/\s*\(%\)\s*$/, '');
      patch({
        values: { nfhs: indicator, round: 'total' },
        metric: {
          label: short.length > 42 ? short.slice(0, 40) + '…' : short,
          unit: /\(%\)/.test(indicator) ? '%' : '',
          decimals: 1,
          legend: (short.length > 34 ? short.slice(0, 32) + '…' : short) + (/\(%\)/.test(indicator) ? ' (%)' : ''),
        },
        title: short,
        slug: slugify(short),
      });
    });

  return (
    <div className="studio-pane split">
      <div className="pane-col">
        <h3>Indicator</h3>
        <p className="hint">
          {indicators.length} indicators from the NFHS pivoted CSV. Pick one and the whole video is driven by it.
        </p>
        <input className="text-input" placeholder="Filter…" value={filter} onChange={(e) => setFilter(e.target.value)} />
        <div className="ind-list">
          {shown.map((i) => (
            <button key={i} className={'ind' + (current === i ? ' on' : '')} onClick={() => pick(i)} disabled={!!busy}>
              {i}
            </button>
          ))}
          {!shown.length && <p className="hint pad">No match.</p>}
        </div>
      </div>

      <div className="pane-col">
        <h3>Loaded data</h3>
        {!data && <p className="hint">Pick an indicator to see the ranking and the change since the last round.</p>}
        {data && (
          <>
            <div className="stat-row">
              <span>{Object.keys(data.values).length} regions</span>
              {data.national !== null && (
                <span className="dim">
                  India {data.nationalPrevious ?? '?'} → <b>{data.national}</b>
                </span>
              )}
            </div>
            {data.missing.length > 0 && <p className="hint warn">No value: {data.missing.join(', ')}</p>}

            <h4>Ranked</h4>
            <div className="rank-list">
              {data.ranked.map(([name, v], i) => (
                <div className="rank-row" key={name}>
                  <span className="idx">{i + 1}</span>
                  <span className="vname">{name}</span>
                  <span className="val">{v}</span>
                </div>
              ))}
            </div>

            {data.movers.length > 0 && (
              <>
                <h4>Biggest movers</h4>
                <div className="rank-list short">
                  {data.movers.map((m) => (
                    <div className="rank-row" key={m.name}>
                      <span className="vname">{m.name}</span>
                      <span className="val">
                        {m.then} → {m.now}{' '}
                        <b className={m.delta > 0 ? 'up' : 'down'}>
                          {m.delta > 0 ? '+' : ''}
                          {m.delta.toFixed(1)}
                        </b>
                      </span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
