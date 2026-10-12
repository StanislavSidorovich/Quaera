import { useI18n } from '../i18n/context';

/**
 * Схема «где лежат ваши данные»: этот браузер → (только если войти, одна
 * строка) → Supabase во Франкфурте, и под ними то, чего нет вовсе.
 *
 * Стоит на двух экранах: справа от колонки «Аккаунта и данных» (на узком —
 * внутри карточки «Что происходит с вашими данными») и в «Приватности»
 * на «О тренажёре». Обе прозы описывают одно и то же устройство словами;
 * схема показывает его формой: всё лежит у вас, наружу ведёт одна
 * стрелка, и она условная.
 *
 * **Вертикальная всегда.** Боковая колонка «Аккаунта» и колонка потока
 * на «О тренажёре» обе уже 480px, а горизонтальная схема в такой ширине
 * сжала бы зоны до подписей в два слова. Одна раскладка вместо двух —
 * и никаких брейкпоинтов внутри компонента.
 *
 * **Разметка, а не SVG** — по тому же правилу, что картинки экскурса:
 * текст в SVG не растёт при A+/A++.
 *
 * `signedIn` есть только на «Аккаунте»: там схема говорит, по какую сторону
 * стрелки вы сейчас. На «О тренажёре» состояния нет — это справочная
 * страница, а не панель управления, и `undefined` рисует схему без него.
 *
 * Подписи — сокращения выверенной прозы account.data*Body, а не новые
 * утверждения (см. комментарий у account.mapTitle в i18n/ru.ts).
 */
export function DataMap({ signedIn }: { signedIn?: boolean }) {
  const { t } = useI18n();
  const a = t.account;

  return (
    <figure className="data-map" aria-label={a.mapTitle}>
      <figcaption className="data-map-title">{a.mapTitle}</figcaption>

      <div className="data-map-zone">
        <p className="data-map-zone-title">{a.mapDeviceTitle}</p>
        <ul>
          {a.mapDeviceItems.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
        <p className="data-map-run">{a.mapDeviceRun}</p>
      </div>

      {/*
       * Стрелка пунктиром: путь существует, но не проложен по умолчанию.
       * На «Аккаунте» при входе он становится сплошным — единственное место
       * схемы, которое меняется от состояния.
       */}
      <div className={`data-map-link${signedIn ? ' on' : ''}`}>
        <span className="data-map-arrow" aria-hidden />
        <span className="data-map-link-label">{a.mapLink}</span>
      </div>

      <div className={`data-map-zone server${signedIn === false ? ' idle' : ''}`}>
        <p className="data-map-zone-title">{a.mapServerTitle}</p>
        <ul>
          {a.mapServerItems.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </div>

      {signedIn !== undefined && (
        <p className={`data-map-state${signedIn ? ' on' : ''}`}>{signedIn ? a.mapSignedIn : a.mapSignedOut}</p>
      )}

      <p className="data-map-none">{a.mapNone}</p>
    </figure>
  );
}
