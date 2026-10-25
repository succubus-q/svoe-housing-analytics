import { number, monthLabel } from './api.ts';

export function Chart({
  values,
  labels,
  color,
  bars,
  suffix,
}: {
  values: (number | null)[];
  labels: string[];
  color: string;
  bars?: boolean;
  suffix: string;
}) {
  const width = 440,
    height = 190,
    left = 43,
    right = 14,
    top = 15,
    bottom = 30;
  const plotWidth = width - left - right,
    plotHeight = height - top - bottom;
  const available = values.filter((v): v is number => v !== null);
  if (!available.length) return <div className="chart-empty">Нет данных за выбранный период</div>;
  const max = Math.max(...available) * 1.18 || 1;
  const x = (index: number) => left + (plotWidth * (index + 0.5)) / Math.max(labels.length, 1);
  const y = (value: number) => top + plotHeight * (1 - value / max);
  const groups: string[] = [];
  let segment = '';
  values.forEach((value, index) => {
    if (value === null) {
      if (segment) groups.push(segment);
      segment = '';
    } else segment += `${segment ? ' L' : 'M'} ${x(index)} ${y(value)}`;
  });
  if (segment) groups.push(segment);
  const labelStep = Math.max(1, Math.ceil(labels.length / 4));
  return (
    <svg
      className="chart-svg"
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={`Месячная динамика, ${suffix}`}
    >
      {[0, 0.5, 1].map((fraction) => (
        <g key={fraction}>
          <line
            x1={left}
            x2={width - right}
            y1={top + plotHeight * fraction}
            y2={top + plotHeight * fraction}
            stroke="#e7ece9"
            strokeDasharray="3 4"
          />
          <text
            x={left - 9}
            y={top + plotHeight * fraction + 4}
            textAnchor="end"
            className="axis-text"
          >
            {number(max * (1 - fraction), 1)}
          </text>
        </g>
      ))}
      {!bars &&
        groups.map((d, index) => (
          <path
            key={index}
            d={d}
            fill="none"
            stroke={color}
            strokeWidth="2.8"
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        ))}
      {values.map((value, index) =>
        value === null ? null : (
          <g key={index}>
            {bars ? (
              <rect
                x={x(index) - (plotWidth / labels.length) * 0.29}
                y={y(value)}
                width={(plotWidth / labels.length) * 0.58}
                height={top + plotHeight - y(value)}
                rx="3"
                fill={color}
                opacity={index === values.length - 1 ? 1 : 0.56}
              />
            ) : (
              <circle
                cx={x(index)}
                cy={y(value)}
                r={index === values.length - 1 ? 4 : 2.5}
                fill={color}
                stroke="white"
                strokeWidth="1"
              />
            )}
            <title>
              {monthLabel(labels[index]!)}: {number(value, 2)} {suffix}
            </title>
          </g>
        ),
      )}
      {labels.map(
        (label, index) =>
          (index % labelStep === 0 || index === labels.length - 1) && (
            <text key={label} x={x(index)} y={height - 6} textAnchor="middle" className="axis-text">
              {monthLabel(label, true).split(' ')[0]}
            </text>
          ),
      )}
    </svg>
  );
}
