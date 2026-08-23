'use client';

interface AgentOption {
  id: string;
  name: string;
  category: string;
}

const CATEGORY_LABELS: Record<string, string> = {
  rebalancing: 'Rebalancing',
  grid_trading: 'Grid Trading',
  yield_optimisation: 'Yield',
  health_factor: 'Health Factor',
};

export function AgentSelector({
  label,
  agents,
  value,
  onChange,
  disabledId,
}: {
  label: string;
  agents: AgentOption[];
  value: string;
  onChange: (id: string) => void;
  disabledId?: string;
}) {
  const grouped = agents.reduce<Record<string, AgentOption[]>>((acc, a) => {
    (acc[a.category] ??= []).push(a);
    return acc;
  }, {});

  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium uppercase tracking-wider text-gray-500">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-xl border border-gray-800 bg-gray-900/50 px-3 py-2.5 text-sm text-white focus:border-amber-500/50 focus:outline-none"
      >
        <option value="">Choose an agent…</option>
        {Object.entries(grouped).map(([category, list]) => (
          <optgroup key={category} label={CATEGORY_LABELS[category] || category}>
            {list.map((a) => (
              <option key={a.id} value={a.id} disabled={a.id === disabledId}>
                {a.name}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
    </label>
  );
}
