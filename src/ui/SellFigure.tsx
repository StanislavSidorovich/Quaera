import { useI18n } from '../i18n/context';
import './sellFigure.css';

/*
 * Рисунок дня «отгрузки против продаж»: слева sell-in (дистрибьютор продаёт
 * магазину), справа sell-out (магазин продаёт покупателю), коробки в задней
 * комнате. Файл public/story/sell-in-sell-out.webp (1376×768) лежит под
 * /story/, поэтому ложится в precache service worker (postbuild-sw.mjs).
 * Подпись и alt берутся из t.storyMode.sellFigure; если файл не загрузился,
 * рамка держит место (aspect-ratio), а alt виден текстом.
 */
export function SellFigure() {
  const { t } = useI18n();
  const f = t.storyMode.sellFigure;
  return (
    <figure className="sellfig">
      <img src="/story/sell-in-sell-out.webp" alt={f.alt} width={1376} height={768} loading="lazy" decoding="async" />
      <figcaption>{f.caption}</figcaption>
    </figure>
  );
}
