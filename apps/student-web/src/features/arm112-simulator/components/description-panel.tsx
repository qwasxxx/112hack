import { mergeClassName, useArmRegionProps } from '../guided/arm-region';

type Props = {
  value: string;
  limit: number;
  onChange: (value: string) => void;
};

export function DescriptionPanel(props: Props) {
  const region = useArmRegionProps('description');
  return (
    <section
      className={mergeClassName('arm112-description', region.className)}
      aria-label="Описание со слов заявителя"
      data-arm-region={region['data-arm-region']}
      onClick={region.onClick}
    >
      <span className="arm112-label">Описание со слов заявителя</span>
      <textarea
        placeholder="введите"
        maxLength={props.limit}
        value={props.value}
        onChange={(event) => props.onChange(event.target.value)}
      />
      <span className="arm112-counter">
        {props.value.length} / {props.limit}
      </span>
    </section>
  );
}
