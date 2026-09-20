import type { SearchHit } from '../data/classifier-runtime';
import { mergeClassName, useArmRegionProps } from '../guided/arm-region';

type Props = {
  search: string;
  hits: SearchHit[];
  selected: string[];
  frequentChips: readonly string[];
  significantTypes: readonly string[];
  onSearch: (value: string) => void;
  onSelect: (type: string) => void;
};

export function IncidentTypePanel(props: Props) {
  const region = useArmRegionProps('incident');
  return (
    <section
      className={mergeClassName('arm112-what', region.className)}
      aria-label="ЧТО СЛУЧИЛОСЬ?"
      data-arm-region={region['data-arm-region']}
      onClick={region.onClick}
    >
      <label className="arm112-field">
        <span className="arm112-label">Введите тип происшествия</span>
        <input
          className="arm112-underline"
          value={props.search}
          onChange={(event) => props.onSearch(event.target.value)}
        />
      </label>
      <h2>ЧТО СЛУЧИЛОСЬ?</h2>
      {props.hits.length > 0 ? (
        <div className="arm112-search-hits">
          {props.hits.map((hit) => (
            <button
              key={`${hit.kind}-${hit.label}`}
              type="button"
              className={props.selected.includes(hit.label) ? 'is-on' : undefined}
              onClick={() => props.onSelect(hit.label)}
            >
              {hit.label}
            </button>
          ))}
        </div>
      ) : (
        <>
          <div className="arm112-chip-wrap">
            {props.frequentChips.map((item) => (
              <button
                key={item}
                type="button"
                className={`arm112-chip${props.selected.includes(item) ? ' is-on' : ''}`}
                onClick={() => props.onSelect(item)}
              >
                {item}
              </button>
            ))}
          </div>
          <p className="arm112-significant">Значимые типы происшествий:</p>
          <div className="arm112-chip-wrap">
            {props.significantTypes.map((item) => (
              <button
                key={item}
                type="button"
                className={`arm112-chip${props.selected.includes(item) ? ' is-on' : ''}`}
                onClick={() => props.onSelect(item)}
              >
                {item}
              </button>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
